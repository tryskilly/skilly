// Run only through the isolated test wrapper: module mocks are process-global.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";

const upserts: unknown[] = [];
const tenantUpdates: unknown[] = [];
mock.module("@/lib/macSession", () => ({ upsertMacEntitlement: async (value: unknown) => { upserts.push(value); } }));
mock.module("@/lib/analytics", () => ({ captureServerEvent: async () => {} }));
mock.module("@/lib/billingEmail", () => ({ sendPastDueEmail: async () => ({ sent: false, reason: "disabled" }) }));
mock.module("@/db", () => ({ getRepo: () => ({ applyTenantBillingEvent: async (input: any) => { tenantUpdates.push([input.tenantId, input.capSeconds]); return { replay: false, applied: true }; }, setTenantUsageCap: async (...args: unknown[]) => tenantUpdates.push(args), setTenantPolarCustomerId: async () => {} }) }));

const { POST } = await import("@/app/api/web/webhooks/polar/route");
const secret = "test-webhook-secret";
const originalEnv = { ...process.env };

function signed(body: string): Request {
  const parsed = JSON.parse(body) as Record<string, unknown>;
  parsed.timestamp = new Date().toISOString();
  body = JSON.stringify(parsed);
  const id = "evt_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("https://studio.example/api/web/webhooks/polar", { method: "POST", body, headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` } });
}

describe("Polar webhook dispatch", () => {
  beforeEach(() => { process.env = { ...originalEnv, POLAR_WEBHOOK_SECRET: secret, POLAR_MAC_PRODUCT_ID: "mac_prod" }; upserts.length = 0; tenantUpdates.length = 0; });
  afterEach(() => { process.env = { ...originalEnv }; });

  test("stores standard Mac subscription in shared entitlement table", async () => {
    const body = JSON.stringify({ type: "subscription.active", data: { status: "active", product_id: "mac_prod", metadata: { surface: "mac", user_id: "u1", email: "u@example.com", plan: "relay" }, customer_id: "c1" } });
    const response = await POST(signed(body) as never);
    expect(response.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ userId: "u1", entitlementType: "relay", status: "active", polarCustomerId: "c1" });
  });

  test("keeps BYOK and Builders paths distinct", async () => {
    const byok = JSON.stringify({ type: "subscription.active", data: { status: "active", product_id: "mac_prod", metadata: { surface: "mac", plan: "byok", macUserId: "u2" }, customer_id: "c2" } });
    await POST(signed(byok) as never);
    expect(upserts[0]).toMatchObject({ userId: "u2", entitlementType: "byok" });
    const builder = JSON.stringify({ type: "subscription.active", data: { metadata: { tenantId: "t1", plan: "studio", planCapSeconds: 90000 }, customer_id: "c3" } });
    await POST(signed(builder) as never);
    expect(tenantUpdates).toEqual([["t1", 90000]]);
    expect(upserts).toHaveLength(1);
  });
});
