import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  buildCheckoutBody,
  interpretSubscriptionEvent,
  verifyWebhookSignature,
} from "../src/domain/billing";
import { MemoryRepo, defaultSeed } from "../src/db/memoryRepo";

const RAW_SECRET_B64 = Buffer.from("supersecret-webhook-key-0123456789").toString("base64");
const SECRET = `whsec_${RAW_SECRET_B64}`;

function sign(id: string, timestamp: string, body: string): string {
  const signed = `${id}.${timestamp}.${body}`;
  const signature = createHmac("sha256", Buffer.from(RAW_SECRET_B64, "base64")).update(signed).digest("base64");
  return `v1,${signature}`;
}

describe("verifyWebhookSignature", () => {
  const id = "msg_1";
  const ts = "1700000000";
  const body = '{"type":"subscription.active"}';

  test("accepts a correctly-signed payload", () => {
    expect(
      verifyWebhookSignature({ secret: SECRET, webhookId: id, webhookTimestamp: ts, body, signatureHeader: sign(id, ts, body) }),
    ).toBe(true);
  });

  test("rejects a tampered body", () => {
    expect(
      verifyWebhookSignature({
        secret: SECRET,
        webhookId: id,
        webhookTimestamp: ts,
        body: '{"type":"subscription.canceled"}',
        signatureHeader: sign(id, ts, body),
      }),
    ).toBe(false);
  });
});

describe("interpretSubscriptionEvent", () => {
  test("active grants the plan cap; canceled drops to 0", () => {
    expect(
      interpretSubscriptionEvent({ type: "subscription.active", data: { metadata: { tenantId: "t1" } } }, 36_000),
    ).toEqual({ tenantId: "t1", capSeconds: 36_000 });
    expect(
      interpretSubscriptionEvent({ type: "subscription.canceled", data: { metadata: { tenantId: "t1" } } }, 36_000),
    ).toEqual({ tenantId: "t1", capSeconds: 0 });
  });

  test("returns null without a tenant id or for unhandled events", () => {
    expect(interpretSubscriptionEvent({ type: "subscription.active", data: {} }, 36_000)).toBeNull();
    expect(
      interpretSubscriptionEvent({ type: "order.paid", data: { metadata: { tenantId: "t1" } } }, 36_000),
    ).toBeNull();
  });
});

describe("buildCheckoutBody + cap update", () => {
  test("checkout body carries products[] and tenant metadata", () => {
    const body = buildCheckoutBody({ productId: "prod_123", tenantId: "t1", successUrl: "https://x/dashboard" });
    expect(body).toEqual({ products: ["prod_123"], success_url: "https://x/dashboard", metadata: { tenantId: "t1" } });
  });

  test("setTenantUsageCap changes the usage summary cap", async () => {
    const repo = new MemoryRepo();
    const tenantId = defaultSeed().tenants[0]!.id;
    await repo.setTenantUsageCap(tenantId, 36_000);
    expect((await repo.getUsageSummary(tenantId)).capSeconds).toBe(36_000);
  });

  test("setTenantPolarCustomerId persists the customer id on the tenant", async () => {
    const repo = new MemoryRepo();
    const tenantId = defaultSeed().tenants[0]!.id;
    expect((await repo.getTenant(tenantId))?.polarCustomerId).toBeNull();
    await repo.setTenantPolarCustomerId(tenantId, "cust_abc");
    expect((await repo.getTenant(tenantId))?.polarCustomerId).toBe("cust_abc");
  });
});

describe("Polar customer id extraction", () => {
  test("subscription events carry the top-level customer_id", () => {
    const update = interpretSubscriptionEvent(
      { type: "subscription.active", data: { metadata: { tenantId: "t1" }, customer_id: "cust_123" } },
      36_000,
    );
    expect(update?.polarCustomerId).toBe("cust_123");
  });

  test("falls back to the nested customer.id shape", () => {
    const update = interpretSubscriptionEvent(
      { type: "subscription.created", data: { metadata: { tenantId: "t1" }, customer: { id: "cust_456" } } },
      36_000,
    );
    expect(update?.polarCustomerId).toBe("cust_456");
  });

  test("omits the customer id when the webhook does not carry one", () => {
    const update = interpretSubscriptionEvent(
      { type: "subscription.active", data: { metadata: { tenantId: "t1" } } },
      36_000,
    );
    expect(update?.polarCustomerId).toBeUndefined();
  });
});
