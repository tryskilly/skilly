import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import worker from "../src/index";

const testSecret = "local-checkout-test-secret";
const testUser = "user_checkout_fixture";
const testEmail = "checkout@example.com";
const originalFetch = globalThis.fetch;
type WorkerEnvironment = Parameters<typeof worker.fetch>[1];

function environment(active = false): WorkerEnvironment {
  return {
    SESSION_TOKEN_SECRET: testSecret,
    POLAR_API_KEY: "test-only",
    POLAR_API_BASE: "https://polar.fixture",
    POLAR_BETA_PRODUCT_ID: "2706ed5f-04b2-4429-a62a-27f9bd9f1ec9",
    SKILLY_ENTITLEMENTS: {
      async get() { return active ? { status: "active", period_end: "2099-01-01T00:00:00Z" } : null; },
      async put() {},
    },
  } as WorkerEnvironment;
}

function checkoutRequest(body: Record<string, unknown>): Request {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: testUser, email: testEmail, iat: issuedAt, exp: issuedAt + 600, iss: "skilly-proxy", aud: "skilly-desktop" })).toString("base64url");
  const signature = createHmac("sha256", testSecret).update(`${header}.${payload}`).digest("base64url");
  return new Request("https://worker.fixture/checkout/create", { method: "POST", headers: { authorization: `Bearer ${header}.${payload}.${signature}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}

afterEach(() => { globalThis.fetch = originalFetch; });

describe("authenticated checkout route", () => {
  for (const attempt of [undefined, "", "   ", "client-attempt-123"]) {
    test(`supports attempt identifier ${JSON.stringify(attempt)}`, async () => {
      let sentMetadata: Record<string, unknown> | undefined;
      // Polar's public MetadataValue requires string lengths from 1 to 500.
      // Exercise the real Worker route and reject the exact invalid payload.
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "https://polar.fixture/v1/checkouts") {
          const payload = JSON.parse(String(init?.body));
          sentMetadata = payload.metadata;
          const invalid = Object.values(payload.metadata).some(value => typeof value === "string" && (value.length < 1 || value.length > 500));
          return invalid
            ? Response.json({ error: "RequestValidationError", detail: [{ type: "string_too_short", loc: ["body", "metadata", "checkout_attempt_id"] }] }, { status: 422 })
            : Response.json({ id: "checkout-fixture", url: "https://polar.sh/checkout/fixture" });
        }
        if (String(input) === "https://us.i.posthog.com/capture/") return Response.json({ status: 1 });
        throw new Error("Unexpected network request in isolated checkout test");
      }) as typeof fetch;
      const logSpy = spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = spyOn(console, "error").mockImplementation(() => {});
      try {
        const result = await worker.fetch(checkoutRequest({ user_id: testUser, email: testEmail, ...(attempt !== undefined ? { checkout_attempt_id: attempt } : {}) }), environment());
        expect(result.status).toBe(200);
        expect((await result.json()).checkout_url).toBe("https://polar.sh/checkout/fixture");
        expect(sentMetadata?.user_id).toBe(testUser);
        expect(sentMetadata?.plan).toBe("beta_19");
        if (attempt?.trim()) expect(sentMetadata?.checkout_attempt_id).toBe(attempt);
        else expect(sentMetadata?.checkout_attempt_id).toMatch(/^[a-f0-9-]{36}$/);
      } finally { logSpy.mockRestore(); errorSpy.mockRestore(); }
    });
  }

  test("never calls Polar for an active subscriber", async () => {
    let providerCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("polar.fixture")) providerCalls++;
      return Response.json({ status: 1 });
    }) as typeof fetch;
    const result = await worker.fetch(checkoutRequest({}), environment(true));
    expect(result.status).toBe(409);
    expect(providerCalls).toBe(0);
  });

  test("rejects malformed attempt IDs before calling the provider", async () => {
    let requests = 0;
    globalThis.fetch = (async () => { requests++; return Response.json({}); }) as typeof fetch;
    for (const checkout_attempt_id of [42, {}, "a".repeat(501)]) {
      const result = await worker.fetch(checkoutRequest({ checkout_attempt_id }), environment());
      expect(result.status).toBe(400);
    }
    expect(requests).toBe(0);
  });

  test("keeps authentication and account ownership checks", async () => {
    let requests = 0;
    globalThis.fetch = (async () => { requests++; return Response.json({}); }) as typeof fetch;
    const unsigned = new Request("https://worker.fixture/checkout/create", { method: "POST", body: "{}" });
    expect((await worker.fetch(unsigned, environment())).status).toBe(401);
    expect((await worker.fetch(checkoutRequest({ user_id: "another-user" }), environment())).status).toBe(403);
    expect(requests).toBe(0);
  });
});
