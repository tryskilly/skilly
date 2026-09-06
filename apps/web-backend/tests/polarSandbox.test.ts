import { describe, expect, test, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { isAllowedPreviewHost, orchestratePolarSandboxCheckout, validatePolarSandboxRequest } from "../src/lib/polarSandbox";
import { mintShortLivedDesktopSessionToken } from "../src/lib/desktopAuth";
import { verifyMacSessionToken } from "../src/lib/macSession";

const saved = { ...process.env };
const base = {
  VERCEL_ENV: "preview",
  SKILLY_BILLING_MODE: "sandbox",
  SKILLY_DATABASE_ENV: "sandbox",
  SKILLY_DATABASE_URL_MARKER: "preview-db",
  DATABASE_URL: "postgres://sandbox",
  POLAR_API_BASE: "https://sandbox-api.polar.sh",
  POLAR_ACCESS_TOKEN: "sandbox-token",
  POLAR_WEBHOOK_SECRET: "sandbox-webhook",
  POLAR_MAC_PRODUCT_ID: "mac-sandbox",
  POLAR_BUILDER_STARTER_PRODUCT_ID: "starter-sandbox",
  SKILLY_PREVIEW_HOST: "preview.example.test",
};

function request(_productId: string, host = "preview.example.test", origin?: string) {
  return new NextRequest(`https://${host}/api/dashboard/polar-sandbox/checkout`, {
    headers: { host, ...(origin ? { origin } : {}) },
  });
}

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("Polar sandbox harness gate", () => {
  test("allows only canonical preview host with complete sandbox markers", () => {
    Object.assign(process.env, base);
    process.env.VERCEL_BRANCH_URL = "branch.example.test";
    expect(isAllowedPreviewHost("branch.example.test")).toBe(true);
    expect(isAllowedPreviewHost("stale.example.test")).toBe(false);
    expect(validatePolarSandboxRequest(request("starter-sandbox", "preview.example.test", "https://preview.example.test"), "starter-sandbox")).toMatchObject({ ok: true });
    expect(validatePolarSandboxRequest(request("starter-sandbox", "other.example.test"), "starter-sandbox").ok).toBe(false);
    expect(validatePolarSandboxRequest(request("starter-sandbox", "preview.example.test", "https://evil.example.test"), "starter-sandbox").ok).toBe(false);
  });

  test("fails closed outside preview or without sandbox database marker", () => {
    Object.assign(process.env, { ...base, VERCEL_ENV: "production" });
    expect(validatePolarSandboxRequest(request("starter-sandbox", "preview.example.test"), "starter-sandbox").ok).toBe(false);
    Object.assign(process.env, { ...base, SKILLY_DATABASE_URL_MARKER: "" });
    expect(validatePolarSandboxRequest(request("starter-sandbox"), "starter-sandbox").ok).toBe(false);
  });

  test("desktop harness token expires on the short-lived window", () => {
    process.env.SESSION_TOKEN_SECRET = "test-secret";
    const token = mintShortLivedDesktopSessionToken({ id: "user_1", email: "user@example.test", firstName: null, lastName: null });
    const session = verifyMacSessionToken(token);
    expect(session?.userId).toBe("user_1");
    expect(session!.expiresAt - session!.issuedAt).toBe(5 * 60);
    expect(JSON.stringify({ url: "https://sandbox.polar.sh/checkout/abc" })).not.toContain("user@example.test");
    expect(JSON.stringify({ url: "https://sandbox.polar.sh/checkout/abc" })).not.toContain(token);
  });

  test("orchestrates B2B and B2C without exposing credentials", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return new Response(JSON.stringify({ url: "https://sandbox.polar.sh/checkout/c_1" }), { status: 200 }); }) as typeof fetch;
    const session = { tenantId: "tenant_1", workosUserId: "user_1", email: "user@example.test" };
    const b2b = await orchestratePolarSandboxCheckout({ product: "builder-starter", session, requestUrl: "https://preview.example.test/x", cookie: "skilly_dashboard_session=secret", fetchImpl, mintToken: () => "never" });
    expect(calls[0].url).toContain("/api/web/checkout"); expect(JSON.parse(String(calls[0].init.body))).toEqual({ plan: "starter" }); expect(b2b.body).toEqual({ url: "https://sandbox.polar.sh/checkout/c_1" });
    const b2c = await orchestratePolarSandboxCheckout({ product: "mac", session, requestUrl: "https://preview.example.test/x", cookie: "skilly_dashboard_session=secret", fetchImpl, mintToken: () => "bearer-secret" });
    expect(calls[1].url).toContain("/api/mac/checkout"); expect(calls[1].init.headers).toMatchObject({ authorization: "Bearer bearer-secret", cookie: "skilly_dashboard_session=secret" }); expect(JSON.stringify(b2c.body)).not.toContain("user@example.test"); expect(JSON.stringify(b2c.body)).not.toContain("bearer-secret"); expect(JSON.stringify(b2c.body)).not.toContain("skilly_dashboard_session=secret");
    const bad = await orchestratePolarSandboxCheckout({ product: "mac", session, requestUrl: "https://preview.example.test/x", fetchImpl: (async () => new Response(JSON.stringify({ url: "http://sandbox.polar.sh/checkout" }), { status: 200 })) as unknown as typeof fetch, mintToken: () => "x" });
    expect(bad.status).toBe(502);
  });

  test("records fixed, surface-specific diagnostics without provider secrets", async () => {
    const secretFixture = "sk_test_UNMISTAKABLE_TOKEN customer@example.test https://evil.example.test BODY_SECRET";
    const originalError = console.error;
    const lines: string[] = [];
    console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
    try {
      const run = (fetchImpl: typeof fetch) => orchestratePolarSandboxCheckout({
        product: "mac", session: { tenantId: "tenant_1", workosUserId: "user_1", email: "customer@example.test" },
        requestUrl: "https://preview.example.test/x", fetchImpl, mintToken: () => "secret-bearer-token",
      });
      await run((async () => { throw new Error(secretFixture); }) as unknown as typeof fetch);
      await run((async () => new Response(secretFixture, { status: 401 })) as unknown as typeof fetch);
      await run((async () => new Response(secretFixture, { status: 403 })) as unknown as typeof fetch);
      await run((async () => new Response(JSON.stringify({ detail: secretFixture }), { status: 422 })) as unknown as typeof fetch);
      await run((async () => new Response("not-json " + secretFixture, { status: 200 })) as unknown as typeof fetch);
      await run((async () => new Response(JSON.stringify({ url: "https://evil.example.test/" }), { status: 200 })) as unknown as typeof fetch);
    } finally {
      console.error = originalError;
    }
    const output = lines.join("\n");
    expect(output).toContain('"surface":"mac_checkout"');
    expect(output).toContain('"status":401');
    expect(output).toContain('"status":403');
    expect(output).toContain('"status":422');
    expect(output).toContain('"status":null');
    expect(output).toContain('"reason":"internal_checkout_non_2xx"');
    expect(output).not.toContain(secretFixture);
    expect(output).not.toContain("customer@example.test");
    expect(output).not.toContain("secret-bearer-token");
    expect(output).not.toContain("evil.example.test");
    expect(output).not.toContain("BODY_SECRET");
  });
});
