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
  plan?: BuilderPlanId;
  /** The Polar customer id, when the webhook carries one. Used for portal sessions. */
  polarCustomerId?: string;
}

export const BUILDER_PLAN_IDS = ["starter", "studio", "scale"] as const;
export type BuilderPlanId = (typeof BUILDER_PLAN_IDS)[number];

export interface BuilderPlan {
  id: BuilderPlanId;
  name: string;
  priceMonthly: number;
  minutes: number;
  capSeconds: number;
  productId?: string;
  description: string;
}

type BillingEnv = Record<string, string | undefined>;

export function isBuilderPlanId(value: string | null | undefined): value is BuilderPlanId {
  return BUILDER_PLAN_IDS.includes(value as BuilderPlanId);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function getBuilderPlans(env: BillingEnv): BuilderPlan[] {
  return [
    {
      id: "starter",
      name: "Starter",
      priceMonthly: 29,
      minutes: 400,
      capSeconds: parsePositiveInteger(env.POLAR_BUILDER_STARTER_CAP_SECONDS ?? env.POLAR_PLAN_CAP_SECONDS, 24_000),
      productId: env.POLAR_BUILDER_STARTER_PRODUCT_ID ?? env.POLAR_PRODUCT_ID,
      description: "For one early product surface.",
    },
    {
      id: "studio",
      name: "Studio",
      priceMonthly: 99,
      minutes: 1_500,
      capSeconds: parsePositiveInteger(env.POLAR_BUILDER_STUDIO_CAP_SECONDS, 90_000),
      productId: env.POLAR_BUILDER_STUDIO_PRODUCT_ID,
      description: "For active product onboarding.",
    },
    {
      id: "scale",
      name: "Scale",
      priceMonthly: 299,
      minutes: 5_000,
      capSeconds: parsePositiveInteger(env.POLAR_BUILDER_SCALE_CAP_SECONDS, 300_000),
      productId: env.POLAR_BUILDER_SCALE_PRODUCT_ID,
      description: "For higher-volume support flows.",
    },
  ];
}

export function resolveBuilderPlan(planId: string | null | undefined, env: BillingEnv): BuilderPlan | null {
  const resolvedPlanId = isBuilderPlanId(planId) ? planId : "starter";
  const plan = getBuilderPlans(env).find((candidate) => candidate.id === resolvedPlanId);
  return plan?.productId ? plan : null;
}

export interface PolarWebhookEvent {
  type?: string;
  data?: {
    metadata?: {
      tenantId?: string;
      plan?: string;
      planCapSeconds?: string | number;
    } | null;
    /** Polar subscription events carry a customer id at the top level. */
    customer_id?: string;
    customer?: {
      id?: string;
      metadata?: {
        tenantId?: string;
        plan?: string;
        planCapSeconds?: string | number;
      } | null;
    } | null;
  } | null;
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
  const data = event.data ?? null;
  const metadata = data?.metadata ?? data?.customer?.metadata ?? null;
  const tenantId = metadata?.tenantId;
  if (!tenantId || !event.type) {
    return null;
  }

  const polarCustomerId = data?.customer_id ?? data?.customer?.id;
  const plan = isBuilderPlanId(metadata?.plan) ? metadata.plan : undefined;
  const planCapSeconds = Number(metadata?.planCapSeconds);
  const capSeconds = Number.isFinite(planCapSeconds) && planCapSeconds > 0 ? Math.round(planCapSeconds) : activeCapSeconds;

  if (event.type === "subscription.created" || event.type === "subscription.active" || event.type === "subscription.updated") {
    return { tenantId, capSeconds, plan, polarCustomerId };
  }
  if (event.type === "subscription.canceled" || event.type === "subscription.revoked") {
    return { tenantId, capSeconds: 0, plan, polarCustomerId };
  }
  return null;
}

export interface CheckoutInput {
  productId: string;
  tenantId: string;
  successUrl: string;
  plan?: BuilderPlanId;
  planCapSeconds?: number;
}

/** Build the Polar checkout request body (products[] form, with tenant metadata). */
export function buildCheckoutBody(input: CheckoutInput): Record<string, unknown> {
  return {
    products: [input.productId],
    success_url: input.successUrl,
    metadata: {
      tenantId: input.tenantId,
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.planCapSeconds ? { planCapSeconds: input.planCapSeconds } : {}),
    },
  };
}
