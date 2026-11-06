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

/** Standard Webhooks replay protection: reject timestamps beyond five minutes. */
export function isWebhookTimestampFresh(timestamp: string, nowMs = Date.now(), toleranceSeconds = 300): boolean {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && Math.abs(nowMs - seconds * 1000) <= toleranceSeconds * 1000;
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

export function getBillingPlanOptions(env: BillingEnv): Omit<BuilderPlan, "productId">[] {
  return getBuilderPlans(env).map(({ id, name, priceMonthly, minutes, capSeconds, description }) => ({
    id,
    name,
    priceMonthly,
    minutes,
    capSeconds,
    description,
  }));
}

export function resolveBuilderPlan(planId: string | null | undefined, env: BillingEnv): BuilderPlan | null {
  const resolvedPlanId = isBuilderPlanId(planId) ? planId : "starter";
  const plan = getBuilderPlans(env).find((candidate) => candidate.id === resolvedPlanId);
  return plan?.productId ? plan : null;
}

export interface PolarWebhookEvent {
  type?: string;
  data?: {
    id?: string;
    status?: string;
    cancel_at_period_end?: boolean;
    created_at?: string;
    updated_at?: string;
    modified_at?: string;
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
 * grants access, scheduled cancellation preserves it, and revoked/past-due removes it.
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

  const providerStatus = typeof data?.status === "string" ? data.status : null;
  const scheduledCancellation = providerStatus === "active" && data?.cancel_at_period_end === true;
  if (event.type === "subscription.created" || event.type === "subscription.active" ||
      (event.type === "subscription.updated" && providerStatus !== "revoked" && providerStatus !== "past_due" && providerStatus !== "inactive" && providerStatus !== "canceled")) {
    return { tenantId, capSeconds, plan, polarCustomerId };
  }
  if (event.type === "subscription.canceled" || event.type === "subscription.uncanceled") {
    if (event.type === "subscription.canceled" && !scheduledCancellation && (providerStatus === "canceled" || providerStatus === "inactive" || providerStatus === "revoked")) {
      return { tenantId, capSeconds: 0, ...(plan ? { plan } : {}), ...(polarCustomerId ? { polarCustomerId } : {}) };
    }
    return { tenantId, capSeconds, ...(plan ? { plan } : {}), ...(polarCustomerId ? { polarCustomerId } : {}) };
  }
  if (event.type === "subscription.revoked" || event.type === "subscription.past_due" || providerStatus === "revoked" || providerStatus === "past_due" || providerStatus === "inactive" || providerStatus === "canceled") {
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
  const productId = input.productId.trim();
  const tenantId = input.tenantId.trim();
  if (!productId || !tenantId) throw new CheckoutPayloadError();
  return {
    products: [productId],
    success_url: input.successUrl,
    metadata: polarMetadata({
      tenantId,
      plan: input.plan,
      planCapSeconds: input.planCapSeconds,
    }),
  };
}

export type PolarMetadataValue = string | number | boolean;

/**
 * Polar metadata strings must be 1–500 characters. An empty string is a 422
 * (`string_too_short`), which is what checkout creation returned on 2026-09-01.
 * Numbers and booleans are allowed; blank strings are omitted.
 */
export function polarMetadata(
  entries: Record<string, PolarMetadataValue | null | undefined>,
): Record<string, PolarMetadataValue> {
  const metadata: Record<string, PolarMetadataValue> = {};
  for (const [rawKey, rawValue] of Object.entries(entries)) {
    const key = rawKey.trim();
    if (key.length < 1 || key.length > 40) continue;
    if (typeof rawValue === "string") {
      const value = rawValue.trim();
      if (value.length < 1 || value.length > 500) continue;
      metadata[key] = value;
      continue;
    }
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      metadata[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean") metadata[key] = rawValue;
  }
  return metadata;
}

export function checkoutFailureReason(status: number, bodyText = ""): string {
  if (status === 422) {
    if (bodyText.includes("string_too_short") || bodyText.includes("string_too_long")) return "polar_metadata_rejected";
    return "polar_validation_error";
  }
  if (status === 401 || status === 403) return "polar_auth_rejected";
  if (status === 404) return "polar_product_not_found";
  return "polar_non_2xx";
}

/**
 * Marketing page that identifies the payer and opens skilly://checkout-success.
 * tryskilly.app 308-redirects `/checkout-success` to `/checkout-success/`, so the
 * slash has to be in the URL Polar stores. Otherwise checkout depends on that hop.
 */
export function macCheckoutSuccessUrl(userId: string): string {
  const url = new URL("https://tryskilly.app/checkout-success/");
  url.searchParams.set("uid", userId);
  return url.toString();
}

export class CheckoutPayloadError extends Error {
  readonly reason = "missing_customer_identity" as const;
  constructor() {
    super("missing_customer_identity");
    this.name = "CheckoutPayloadError";
  }
}

function customerEmailForPolar(email: string): string | undefined {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/** Stable whole-second ISO timestamp. The Mac app's period parser accepts this form. */
export function provisionalPaidPeriodEnd(eventAt: string | null | undefined): string {
  const parsed = eventAt ? Date.parse(eventAt) : Number.NaN;
  const start = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(start + 32 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
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
  const userId = input.userId.trim();
  const productId = input.productId.trim();
  if (!userId || !productId) throw new CheckoutPayloadError();
  const checkoutAttemptId = input.checkoutAttemptId?.trim() || randomUUID();
  const email = customerEmailForPolar(input.email);
  const metadata = polarMetadata({
    surface: input.surface,
    user_id: userId,
    email,
    checkout_attempt_id: checkoutAttemptId,
    product_line: "people",
    plan: "beta_19",
  });
  return {
    products: [productId],
    ...(email ? { customer_email: email } : {}),
    success_url: input.successUrl,
    metadata,
  };
}

export interface ByokCheckoutInput {
  productId: string;
  userId: string;
  email: string;
  successUrl: string;
}

/** Platform-fee checkout for Mac users who bring their own OpenAI key. */
export function buildByokCheckoutBody(input: ByokCheckoutInput): Record<string, unknown> {
  const userId = input.userId.trim();
  const productId = input.productId.trim();
  if (!userId || !productId) throw new CheckoutPayloadError();
  const email = customerEmailForPolar(input.email);
  return {
    products: [productId],
    ...(email ? { customer_email: email } : {}),
    success_url: input.successUrl,
    metadata: polarMetadata({
      surface: "mac",
      plan: "byok",
      macUserId: userId,
      email,
    }),
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
  /** Checkout success must not replace a subscription period that already arrived. */
  preserveExistingPeriod?: boolean;
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
  // Trust metadata we set ourselves. A mismatched POLAR_MAC_PRODUCT_ID used to
  // drop the webhook, so the customer paid and the Mac app never left trial.
  const markedPersonal = surface === "mac" || surface === "extension" || metadata.product_line === "people" || metadata.plan === "beta_19" || metadata.plan === "relay";
  const productMatches = Boolean(productId && personalProducts.size > 0 && personalProducts.has(productId));
  if (!markedPersonal && !productMatches) return null;
  const providerStatus = typeof data?.status === "string" ? data.status : null;
  const scheduledCancellation = providerStatus === "active" && data?.cancel_at_period_end === true;
  const status = type === "checkout.updated" && providerStatus === "succeeded" ? "active" :
    type === "subscription.revoked" || providerStatus === "revoked" ? "none" :
    type === "subscription.past_due" || providerStatus === "past_due" ? "past_due" :
    (type === "subscription.canceled" && !scheduledCancellation) || providerStatus === "canceled" || providerStatus === "inactive" ? "canceled" :
    (scheduledCancellation || type === "subscription.active" || type === "subscription.uncanceled" || type === "subscription.updated" || (type === "subscription.created" && providerStatus === "active")) && (!providerStatus || providerStatus === "active") ? "active" : null;
  if (!status) return null;
  const stringValue = (value: unknown): string | null => typeof value === "string" ? value : null;
  const eventAt = stringValue(data?.modified_at) ?? stringValue(data?.updated_at) ?? stringValue(data?.created_at) ?? stringValue(root.modified_at) ?? stringValue(root.updated_at) ?? stringValue(root.created_at) ?? stringValue(root.timestamp);
  return {
    userId: metadata.user_id,
    email: stringValue(metadata.email),
    status,
    plan: typeof metadata.plan === "string" ? metadata.plan : "relay",
    periodStart: stringValue(data?.current_period_start),
    periodEnd: stringValue(data?.current_period_end) ?? (status === "active" ? provisionalPaidPeriodEnd(eventAt) : null),
    polarCustomerId: stringValue(data?.customer_id) ?? stringValue(customer?.id),
    providerEventAt: eventAt,
    providerEventId: stringValue(data?.id) ?? stringValue(root.id),
    preserveExistingPeriod: type === "checkout.updated",
  };
}

export interface CheckoutFailureNotice {
  userId: string;
  reason: "polar_checkout_expired" | "polar_checkout_failed" | "missing_user_id";
}

/** Checkout sessions that ended without a paid subscription. No entitlement write. */
export function interpretCheckoutFailure(event: unknown): CheckoutFailureNotice | null {
  if (!event || typeof event !== "object") return null;
  const root = event as Record<string, unknown>;
  const type = typeof root.type === "string" ? root.type : null;
  if (type !== "checkout.expired" && type !== "checkout.updated") return null;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : null;
  const customer = data?.customer && typeof data.customer === "object" ? data.customer as Record<string, unknown> : null;
  const rawMetadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : customer?.metadata;
  const metadata = rawMetadata && typeof rawMetadata === "object" ? rawMetadata as Record<string, unknown> : null;
  const providerStatus = typeof data?.status === "string" ? data.status : null;
  const failed = type === "checkout.expired" || providerStatus === "expired" || providerStatus === "failed";
  if (!failed) return null;
  const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
  if (!userId) return { userId: "", reason: "missing_user_id" };
  return { userId, reason: providerStatus === "failed" ? "polar_checkout_failed" : "polar_checkout_expired" };
}
