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
    const b2c = await orchestratePolarSandboxCheckout({ product: "mac", session, requestUrl: "https://preview.example.test/x", fetchImpl, mintToken: () => "bearer-secret" });
    expect(calls[1].url).toContain("/api/mac/checkout"); expect(calls[1].init.headers).toMatchObject({ authorization: "Bearer bearer-secret" }); expect(JSON.stringify(b2c.body)).not.toContain("user@example.test"); expect(JSON.stringify(b2c.body)).not.toContain("bearer-secret");
    const bad = await orchestratePolarSandboxCheckout({ product: "mac", session, requestUrl: "https://preview.example.test/x", fetchImpl: (async () => new Response(JSON.stringify({ url: "http://sandbox.polar.sh/checkout" }), { status: 200 })) as unknown as typeof fetch, mintToken: () => "x" });
    expect(bad.status).toBe(502);
  });
});
