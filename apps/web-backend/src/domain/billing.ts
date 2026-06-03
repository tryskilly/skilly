// Polar billing — Standard Webhooks signature verification, subscription-event
// → tenant-cap interpretation, and the checkout payload builder. Pure functions
// (crypto + mapping) so they're unit-testable without hitting Polar.
//
// This ports the Cloudflare Worker's Polar logic (Standard Webhooks signing +
// products[] checkout) into the web backend — reuse, not reinvention.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookVerifyInput {
  /** `whsec_<base64>` secret from Polar. */
  secret: string;
  webhookId: string;
  webhookTimestamp: string;
  body: string;
  /** `webhook-signature` header — space-separated `v1,<base64sig>` entries. */
  signatureHeader: string;
}

/** Verify a Standard Webhooks signature (constant-time). */
export function verifyWebhookSignature(input: WebhookVerifyInput): boolean {
  const secretBytes = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${input.webhookId}.${input.webhookTimestamp}.${input.body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const providedSignatures = input.signatureHeader
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((signature): signature is string => Boolean(signature));

  return providedSignatures.some((signature) => safeEqual(signature, expected));
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/** The result of interpreting a Polar subscription webhook for our tenant model. */
export interface CapUpdate {
  tenantId: string;
  capSeconds: number;
}

export interface PolarWebhookEvent {
  type?: string;
  data?: {
    metadata?: { tenantId?: string } | null;
    customer?: { metadata?: { tenantId?: string } | null } | null;
  };
}

/**
 * Map a Polar subscription event to the tenant's new usage cap. Active/created
 * grants `activeCapSeconds`; canceled/revoked drops to 0 (no paid access).
 * Returns null for events we don't act on or that lack a tenant id.
 */
export function interpretSubscriptionEvent(
  event: PolarWebhookEvent,
  activeCapSeconds: number,
): CapUpdate | null {
  const tenantId = event.data?.metadata?.tenantId ?? event.data?.customer?.metadata?.tenantId;
  if (!tenantId || !event.type) {
    return null;
  }

  if (event.type === "subscription.created" || event.type === "subscription.active" || event.type === "subscription.updated") {
    return { tenantId, capSeconds: activeCapSeconds };
  }
  if (event.type === "subscription.canceled" || event.type === "subscription.revoked") {
    return { tenantId, capSeconds: 0 };
  }
  return null;
}

export interface CheckoutInput {
  productId: string;
  tenantId: string;
  successUrl: string;
}

/** Build the Polar checkout request body (products[] form, with tenant metadata). */
export function buildCheckoutBody(input: CheckoutInput): Record<string, unknown> {
  return {
    products: [input.productId],
    success_url: input.successUrl,
    metadata: { tenantId: input.tenantId },
  };
}
