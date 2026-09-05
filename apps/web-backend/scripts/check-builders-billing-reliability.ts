import { mock } from "bun:test";
import assert from "node:assert/strict";

let authenticated = true;
let customerId: string | null = "customer_fixture";
const session = {
  role: "super_admin" as const,
  tenantId: "tenant_fixture",
  issuedAt: Date.now(),
  workosUserId: "user_fixture",
  email: "owner@example.com",
};
const repo = { getTenant: async () => ({
  id: "tenant_fixture",
  name: "Fixture",
  allowedOrigins: [],
  allowedAppIds: [],
  usageCapSeconds: 10_800,
  polarCustomerId: customerId,
}) };

mock.module("@/lib/dashboardAuth", () => ({
  requireDashboardSession: async () => {
    if (!authenticated) throw new Error("redirect:/login");
    return session;
  },
}));
mock.module("@/db", () => ({ getRepo: () => repo }));
mock.module("@/lib/analytics", () => ({ captureServerEvent: async () => undefined }));

process.env.POLAR_ACCESS_TOKEN = "fixture-token";
process.env.POLAR_PRODUCT_ID = "starter-product";
process.env.POLAR_BUILDER_STUDIO_PRODUCT_ID = "studio-product";
process.env.POLAR_BUILDER_SCALE_PRODUCT_ID = "scale-product";

let responseBody: unknown = { url: "https://polar.sh/checkout/fixture" };
let responseStatus = 200;
let networkFailure = false;
let calls: Array<{ url: string; body: Record<string, unknown> }> = [];
globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
  if (networkFailure) throw new Error("network down");
  return new Response(JSON.stringify(responseBody), { status: responseStatus, headers: { "content-type": "application/json" } });
}, { preconnect: globalThis.fetch.preconnect }) as typeof fetch;

const { NextRequest } = await import("next/server");
const { POST: checkout } = await import("../src/app/api/web/checkout/route");
const { POST: portal } = await import("../src/app/api/web/portal/route");

function request(path: string, body?: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`https://studio.example/api/web/${path}`, {
    method: "POST",
    ...(body === undefined ? {} : { body }),
  });
}

async function main(): Promise<void> {
  calls = [];
  responseStatus = 200;
  responseBody = { url: "https://polar.sh/checkout/fixture" };
  const checkoutResponse = await checkout(request("checkout", JSON.stringify({ plan: "starter" })));
  assert.equal(checkoutResponse.status, 200);
  assert.deepEqual(await checkoutResponse.json(), { url: "https://polar.sh/checkout/fixture" });
  assert.equal(calls[0]?.url, "https://api.polar.sh/v1/checkouts");

  for (const body of ["null", "[]", "not-json"]) {
    calls = [];
    assert.equal((await checkout(request("checkout", body))).status, 400);
    assert.equal(calls.length, 0);
  }
  for (const body of [JSON.stringify({ plan: "unknown" }), JSON.stringify({ plan: 42 })]) {
    calls = [];
    assert.equal((await checkout(request("checkout", body))).status, 400);
    assert.equal(calls.length, 0);
  }

  for (const status of [401, 403, 422]) {
    calls = [];
    responseStatus = status;
    responseBody = { detail: "provider-secret-body", url: "https://secret.example" };
    assert.equal((await checkout(request("checkout", "{}"))).status, 502);
    assert.equal(calls.length, 1);
  }
  for (const body of [null, [], "provider-string", {}, { url: "javascript:alert(1)" }, { url: 12 }]) {
    responseStatus = 200;
    responseBody = body;
    assert.equal((await checkout(request("checkout", "{}"))).status, 502);
  }
  networkFailure = true;
  assert.equal((await checkout(request("checkout", "{}"))).status, 502);
  networkFailure = false;

  calls = [];
  responseStatus = 201;
  responseBody = { customer_portal_url: "https://polar.sh/portal/fixture" };
  const portalResponse = await portal(request("portal"));
  assert.equal(portalResponse.status, 200);
  assert.deepEqual(await portalResponse.json(), { url: "https://polar.sh/portal/fixture" });
  assert.equal(calls.at(-1)?.url, "https://api.polar.sh/v1/customer-sessions");
  assert.equal(calls.at(-1)?.body.customer_id, "customer_fixture");

  for (const status of [401, 403, 422]) {
    responseStatus = status;
    responseBody = { detail: "portal-secret-body" };
    assert.equal((await portal(request("portal"))).status, 502);
  }
  for (const body of [null, [], "provider-string", {}, { customer_portal_url: "javascript:alert(1)" }, { customer_portal_url: 12 }]) {
    responseStatus = 200;
    responseBody = body;
    assert.equal((await portal(request("portal"))).status, 502);
  }
  customerId = null;
  assert.equal((await portal(request("portal"))).status, 409);
  authenticated = false;
  await assert.rejects(checkout(request("checkout", "{}")), /redirect/);
  await assert.rejects(portal(request("portal")), /redirect/);

  console.log("builders billing reliability scenarios passed; endpoint and diagnostics fixtures were isolated");
}

await main();
