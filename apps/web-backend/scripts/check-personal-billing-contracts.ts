// Isolated process: Bun module mocks must never leak into other test suites.
// All identities and provider replies are fixtures; no network or payment is used.
import { mock } from "bun:test";
import assert from "node:assert/strict";

let authenticated = true;
let entitlement: Record<string, unknown> | null = null;
const session = () => authenticated ? { userId: "user_fixture", email: "fixture@example.com" } : null;
mock.module("@/lib/macSession", () => ({ authenticateMacRequest: session, getMacEntitlement: async () => entitlement }));
mock.module("@/lib/extensionSession", () => ({ authenticateExtensionRequest: session }));
mock.module("@/lib/analytics", () => ({ captureServerEvent: async () => {} }));
process.env.POLAR_ACCESS_TOKEN = "fixture-only";
process.env.POLAR_MAC_PRODUCT_ID = "product_fixture";
process.env.POLAR_BUILDER_STARTER_PRODUCT_ID = "starter_fixture";
process.env.POLAR_WEBHOOK_SECRET = "webhook_fixture";
process.env.SKILLY_BILLING_MODE = "production";

let providerPayload: unknown = {};
let providerStatus = 200;
let providerRaw: string | null = null;
let providerThrow = false;
let calls: { url: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
  if (providerThrow) throw new Error("sk_test_UNMISTAKABLE_TOKEN customer@example.test https://evil.example.test BODY_SECRET");
  return providerRaw === null ? new Response(JSON.stringify(providerPayload), { status: providerStatus, headers: { "content-type": "application/json" } }) : new Response(providerRaw, { status: providerStatus });
}, { preconnect: globalThis.fetch.preconnect }) as typeof fetch;

const { NextRequest } = await import("next/server");
let checks = 0;
for (const surface of ["mac", "extension"]) {
  const { POST: checkout } = await import(`../src/app/api/${surface}/checkout/route`);
  const { GET: portal } = await import(`../src/app/api/${surface}/portal/route`);
  const request = (path: string, method: string, body?: string) => new NextRequest(`https://studio.example/api/${surface}/${path}`, { method, ...(body === undefined ? {} : { body }) });

  for (const body of ["null", "[]", "invalid-json", JSON.stringify({ checkout_attempt_id: 12 }), JSON.stringify({ checkout_attempt_id: "x".repeat(501) })]) {
    calls = [];
    assert.equal((await checkout(request("checkout", "POST", body))).status, 400);
    assert.equal(calls.length, 0);
    checks++;
  }
  for (const body of ["{}", JSON.stringify({ checkout_attempt_id: "   " }), JSON.stringify({ checkout_attempt_id: "attempt_fixture" })]) {
    calls = [];
    providerPayload = { url: "https://polar.sh/checkout/fixture" };
    const response = await checkout(request("checkout", "POST", body));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { checkout_url: "https://polar.sh/checkout/fixture" });
    assert.equal(calls[0]?.url, "https://api.polar.sh/v1/checkouts");
    const metadata = calls[0]!.body.metadata as Record<string, string>;
    assert.equal(metadata.user_id, "user_fixture");
    assert.equal(metadata.surface, surface);
    assert.ok(metadata.checkout_attempt_id?.length);
    checks++;
  }
  for (const payload of [{}, { url: "javascript:alert(1)" }, { url: 12 }]) {
    providerPayload = payload;
    providerStatus = 200; providerRaw = null; providerThrow = false;
    assert.equal((await checkout(request("checkout", "POST", "{}"))).status, 502);
    checks++;
  }
  if (surface === "mac") {
    const secretFixture = "sk_test_UNMISTAKABLE_TOKEN customer@example.test https://evil.example.test BODY_SECRET";
    const originalError = console.error;
    const diagnostics: string[] = [];
    console.error = (...args: unknown[]) => diagnostics.push(args.map(String).join(" "));
    try {
      for (const scenario of [
        { status: 401, reason: "provider_non_2xx", raw: secretFixture },
        { status: 403, reason: "provider_non_2xx", raw: secretFixture },
        { status: 422, reason: "provider_non_2xx", raw: JSON.stringify({ detail: secretFixture }) },
        { status: 200, reason: "provider_network_error", raw: null, network: true },
        { status: 200, reason: "provider_invalid_json", raw: "not-json " + secretFixture },
      ]) {
        providerStatus = scenario.status; providerRaw = scenario.raw ?? null; providerThrow = Boolean(scenario.network);
        const response = await checkout(request("checkout", "POST", "{}"));
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), { error: "checkout creation failed" });
        checks++;
      }
    } finally { console.error = originalError; }
    const output = diagnostics.join("\n");
    for (const [status, reason] of [[401, "provider_non_2xx"], [403, "provider_non_2xx"], [422, "provider_non_2xx"], [200, "provider_invalid_json"], [null, "provider_network_error"]] as const) {
      assert.ok(output.includes(`\"surface\":\"mac_checkout\",\"status\":${status === null ? "null" : status},\"reason\":\"${reason}\"`));
    }
    assert.ok(!output.includes(secretFixture));
    assert.ok(!output.includes("customer@example.test"));
    assert.ok(!output.includes("evil.example.test"));
    assert.ok(!output.includes("BODY_SECRET"));
    providerStatus = 200; providerRaw = null; providerThrow = false;
  }
  entitlement = { status: "active" };
  calls = [];
  assert.equal((await checkout(request("checkout", "POST", "{}"))).status, 409);
  assert.equal(calls.length, 0);
  checks++;
  entitlement = { status: "canceled", polar_customer_id: "customer_fixture" };
  providerPayload = { customer_portal_url: "https://polar.sh/portal/fixture" };
  calls = [];
  const response = await portal(request("portal", "GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { portal_url: "https://polar.sh/portal/fixture" });
  assert.equal(calls[0]?.url, "https://api.polar.sh/v1/customer-sessions");
  assert.equal(calls[0]?.body.customer_id, "customer_fixture");
  checks++;
  providerPayload = {};
  assert.equal((await portal(request("portal", "GET"))).status, 502);
  checks++;
  authenticated = false;
  calls = [];
  assert.equal((await portal(request("portal", "GET"))).status, 401);
  assert.equal((await checkout(request("checkout", "POST", "{}"))).status, 401);
  assert.equal(calls.length, 0);
  checks++;
  authenticated = true;
  entitlement = null;
}
process.env.SKILLY_BILLING_MODE = "sandbox";
process.env.VERCEL_ENV = "preview";
process.env.POLAR_API_BASE = "https://sandbox-api.polar.sh";
process.env.SKILLY_DATABASE_ENV = "sandbox";
process.env.SKILLY_DATABASE_URL_MARKER = "personal-preview";
process.env.DATABASE_URL = "sandbox-db";
calls = [];
providerPayload = { url: "https://polar.sh/checkout/sandbox" };
const sandboxRequest = new NextRequest("https://studio.example/api/mac/checkout", { method: "POST", body: "{}" });
assert.equal((await (await import("../src/app/api/mac/checkout/route")).POST(sandboxRequest)).status, 200);
assert.equal(calls[0]?.url, "https://sandbox-api.polar.sh/v1/checkouts");
assert.equal((calls[0]?.body.products as string[])[0], "product_fixture");
checks++;
console.log(`${checks} personal billing route contract scenarios passed; no external requests.`);
