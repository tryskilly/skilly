// Polar billing — Standard Webhooks signature verification, subscription-event
// → tenant-cap interpretation, and the checkout payload builder. Pure functions
// (crypto + mapping) so they're unit-testable without hitting Polar.
//
// This ports the Cloudflare Worker's Polar logic (Standard Webhooks signing +
// products[] checkout) into the web backend — reuse, not reinvention.

import { createHmac, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";

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
  const signedContent = `${input.webhookId}.${input.webhookTimestamp}.${input.body}`;

  const providedSignatures = input.signatureHeader
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((signature): signature is string => Boolean(signature));

  if (providedSignatures.length === 0) return false;

  // Polar currently signs with the literal endpoint secret bytes (including
  // its `polar_whs_` prefix). The Standard Webhooks spec instead describes a
  // `whsec_` value whose suffix is base64-encoded key material. Accept both
  // forms so a correctly configured Polar endpoint is not rejected while
  // retaining compatibility with spec-compliant secrets and rotated keys.
  const secretCandidates = [
    Buffer.from(input.secret, "utf8"),
    ...(input.secret.startsWith("whsec_")
      ? [Buffer.from(input.secret.slice("whsec_".length), "base64")]
      : []),
  ];

  return secretCandidates.some((secretBytes) => {
    const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    return providedSignatures.some((signature) => safeEqual(signature, expected));
  });
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
    amount?: number;
    currency?: string;
    customer?: {
      id?: string;
      email?: string;
      name?: string;
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

export interface PersonalCheckoutInput {
  productId: string;
  userId: string;
  email: string;
  successUrl: string;
  checkoutAttemptId?: string | null;
  surface: "mac" | "extension";
}

/** Build the single-user Polar payload used by native clients. */
export function buildPersonalCheckoutBody(input: PersonalCheckoutInput): Record<string, unknown> {
  const checkoutAttemptId = input.checkoutAttemptId?.trim() || randomUUID();
  return {
    products: [input.productId],
    success_url: input.successUrl,
    metadata: {
      surface: input.surface,
      user_id: input.userId,
      email: input.email,
      checkout_attempt_id: checkoutAttemptId,
    },
  };
}

export function parseCheckoutAttemptId(value: unknown): { valid: true; value: string | null } | { valid: false } {
  if (value == null) return { valid: true, value: null };
  if (typeof value !== "string" || value.length > 500) return { valid: false };
  return { valid: true, value: value.trim() || null };
}

export function isValidBillingUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function hasCurrentPersonalEntitlement(record: {
  status?: string | null;
  period_end?: string | null;
} | null): boolean {
  if (!record || record.status !== "active") return false;
  if (!record.period_end) return true;
  const periodEnd = Date.parse(record.period_end);
  return Number.isNaN(periodEnd) || periodEnd > Date.now();
}

export interface PersonalSubscriptionUpdate {
  userId: string;
  email?: string | null;
  status: "active" | "canceled" | "past_due" | "none";
  plan?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  polarCustomerId?: string | null;
  providerEventAt?: string | null;
  providerEventId?: string | null;
}

/** Guard personal entitlement writes against out-of-order provider delivery. */
export function shouldApplyPersonalProviderEvent(
  existingEventAt: string | null | undefined,
  incomingEventAt: string | null | undefined,
): boolean {
  if (!existingEventAt) return true;
  if (!incomingEventAt) return false;
  const existing = Date.parse(existingEventAt);
  const incoming = Date.parse(incomingEventAt);
  return Number.isFinite(existing) && Number.isFinite(incoming) && incoming >= existing;
}

export function getPersonalProductIds(env: BillingEnv): Set<string> {
  return new Set([env.POLAR_MAC_PRODUCT_ID, env.POLAR_BETA_PRODUCT_ID, env.POLAR_EXTENSION_PRODUCT_ID].filter((id): id is string => Boolean(id)));
}

export function interpretPersonalSubscriptionEvent(event: unknown, env: BillingEnv = process.env): PersonalSubscriptionUpdate | null {
  if (!event || typeof event !== "object") return null;
  const root = event as Record<string, unknown>;
  const type = typeof root.type === "string" ? root.type : null;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : null;
  const customer = data?.customer && typeof data.customer === "object" ? data.customer as Record<string, unknown> : null;
  const rawMetadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : customer?.metadata;
  const metadata = rawMetadata && typeof rawMetadata === "object" ? rawMetadata as Record<string, unknown> : null;
  const surface = metadata?.surface;
  const productId = typeof data?.product_id === "string" ? data.product_id :
    (data?.product && typeof data.product === "object" && typeof (data.product as Record<string, unknown>).id === "string" ? (data.product as Record<string, unknown>).id as string : null);
  const surfaceAllowed = surface === undefined || surface === "mac" || surface === "extension";
  if (!type || !surfaceAllowed || metadata?.plan === "byok" || typeof metadata?.user_id !== "string") return null;
  const personalProducts = getPersonalProductIds(env);
  if (!productId || personalProducts.size === 0 || !personalProducts.has(productId)) return null;
  const providerStatus = typeof data?.status === "string" ? data.status : null;
  const status = type === "subscription.revoked" ? "none" :
    type === "subscription.past_due" || providerStatus === "past_due" ? "past_due" :
    type === "subscription.canceled" ? "canceled" :
    (type === "subscription.active" || type === "subscription.updated" || (type === "subscription.created" && providerStatus === "active")) && (!providerStatus || providerStatus === "active") ? "active" : null;
  if (!status) return null;
  const stringValue = (value: unknown): string | null => typeof value === "string" ? value : null;
  const eventAt = stringValue(data?.created_at) ?? stringValue(data?.updated_at) ?? stringValue(root.created_at) ?? stringValue(root.timestamp);
  return {
    userId: metadata.user_id,
    email: stringValue(metadata.email),
    status,
    plan: typeof metadata.plan === "string" ? metadata.plan : "relay",
    periodStart: stringValue(data?.current_period_start),
    periodEnd: stringValue(data?.current_period_end),
    polarCustomerId: stringValue(data?.customer_id) ?? stringValue(customer?.id),
    providerEventAt: eventAt,
    providerEventId: stringValue(data?.id) ?? stringValue(root.id),
  };
}
