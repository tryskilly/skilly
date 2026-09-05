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

let providerPayload: unknown = {};
let calls: { url: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
  return Response.json(providerPayload);
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
    assert.equal((await checkout(request("checkout", "POST", "{}"))).status, 502);
    checks++;
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
console.log(`${checks} personal billing route contract scenarios passed; no external requests.`);
