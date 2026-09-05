// POST /api/web/webhooks/polar — Polar subscription webhooks (Standard Webhooks
// signature). On an active subscription we grant the tenant the plan cap; on
// cancel/revoke we drop it to 0. The tenant id rides in the checkout metadata.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { interpretPersonalSubscriptionEvent, interpretSubscriptionEvent, verifyWebhookSignature } from "@/domain/billing";
import { captureServerEvent } from "@/lib/analytics";
import { sendPastDueEmail } from "@/lib/billingEmail";
import { upsertMacEntitlement } from "@/lib/macSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAN_CAP_SECONDS = 24_000; // Starter fallback: 400 min/month

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    await captureServerEvent("polar_webhook_failed", {
      status: 500,
      reason: "billing_not_configured",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const verified = verifyWebhookSignature({
    secret,
    webhookId: request.headers.get("webhook-id") ?? "",
    webhookTimestamp: request.headers.get("webhook-timestamp") ?? "",
    body: rawBody,
    signatureHeader: request.headers.get("webhook-signature") ?? "",
  });
  if (!verified) {
    await captureServerEvent("polar_webhook_failed", {
      status: 401,
      reason: "invalid_signature",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    await captureServerEvent("polar_webhook_failed", {
      status: 400,
      reason: "invalid_json",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const activeCapSeconds = Number(process.env.POLAR_PLAN_CAP_SECONDS ?? DEFAULT_PLAN_CAP_SECONDS);
  const parsedEvent = event as Parameters<typeof interpretSubscriptionEvent>[0];
  const update = interpretSubscriptionEvent(parsedEvent, activeCapSeconds);
  const macUpdate = interpretMacByokSubscriptionEvent(event);
  const personalUpdate = interpretPersonalSubscriptionEvent(event, process.env);
  if (parsedEvent.type === "subscription.past_due" && parsedEvent.data?.customer?.email) {
    const emailResult = await sendPastDueEmail({
      eventId: request.headers.get("webhook-id") ?? `${parsedEvent.type}:${parsedEvent.data.customer_id ?? parsedEvent.data.customer.email}`,
      email: parsedEvent.data.customer.email,
      customerName: parsedEvent.data.customer.name,
      amountCents: parsedEvent.data.amount,
      currency: parsedEvent.data.currency,
    });
    await captureServerEvent("billing_past_due_email_attempted", {
      result: emailResult.sent ? "sent" : emailResult.reason,
      source_surface: "web_backend",
    });
  }
  if (update) {
    const repo = getRepo();
    await repo.setTenantUsageCap(update.tenantId, update.capSeconds);
    // Persist the Polar customer id so we can open a customer-portal session later.
    if (update.polarCustomerId) {
      await repo.setTenantPolarCustomerId(update.tenantId, update.polarCustomerId);
    }
    await captureServerEvent("tenant_plan_cap_updated", {
      tenant_id: update.tenantId,
      cap_seconds: update.capSeconds,
      plan: update.plan,
      source_surface: "web_backend",
    });
  }

  if (macUpdate) {
    await upsertMacEntitlement({
      userId: macUpdate.userId,
      email: macUpdate.email,
      status: macUpdate.status,
      entitlementType: "byok",
      periodStart: macUpdate.periodStart,
      periodEnd: macUpdate.periodEnd,
      plan: "byok",
      polarCustomerId: macUpdate.polarCustomerId,
      providerEventAt: macUpdate.providerEventAt ?? webhookTimestampIso(request.headers.get("webhook-timestamp")),
      providerEventId: macUpdate.providerEventId ?? request.headers.get("webhook-id"),
    });
    await captureServerEvent("mac_byok_plan_updated", {
      workos_user_id: macUpdate.userId,
      status: macUpdate.status,
      source_surface: "web_backend",
    });
  }

  if (personalUpdate) {
    await upsertMacEntitlement({
      userId: personalUpdate.userId,
      email: personalUpdate.email,
      status: personalUpdate.status,
      entitlementType: "relay",
      periodStart: personalUpdate.periodStart,
      periodEnd: personalUpdate.periodEnd,
      plan: personalUpdate.plan,
      polarCustomerId: personalUpdate.polarCustomerId,
      providerEventAt: personalUpdate.providerEventAt ?? webhookTimestampIso(request.headers.get("webhook-timestamp")),
      providerEventId: personalUpdate.providerEventId ?? request.headers.get("webhook-id"),
    });
    await captureServerEvent("mac_personal_plan_updated", {
      workos_user_id: personalUpdate.userId,
      status: personalUpdate.status,
      source_surface: "web_backend",
    });
  }

  if (!update && !macUpdate && !personalUpdate) {
    await captureServerEvent("polar_webhook_ignored", {
      source_surface: "web_backend",
    });
  }

  return NextResponse.json({ ok: true, applied: Boolean(update || macUpdate || personalUpdate) }, { status: 200 });
}

function interpretMacByokSubscriptionEvent(event: unknown): {
  userId: string;
  email?: string | null;
  status: "active" | "canceled" | "past_due" | "none";
  periodStart?: string | null;
  periodEnd?: string | null;
  polarCustomerId?: string | null;
  providerEventAt?: string | null;
  providerEventId?: string | null;
} | null {
  if (!event || typeof event !== "object") {
    return null;
  }

  const eventRecord = event as Record<string, unknown>;
  const type = typeof eventRecord.type === "string" ? eventRecord.type : null;
  const data = recordOrNull(eventRecord.data);
  const customer = recordOrNull(data?.customer);
  const metadata = recordOrNull(data?.metadata) ?? recordOrNull(customer?.metadata);
  if (!type || metadata?.surface !== "mac" || metadata?.plan !== "byok" || typeof metadata.macUserId !== "string") {
    return null;
  }

  const providerStatus = typeof data?.status === "string" ? data.status : null;
  let status: "active" | "canceled" | "past_due" | "none" | null = null;
  if (type === "subscription.past_due" || providerStatus === "past_due") {
    status = "past_due";
  } else if (type === "subscription.created" || type === "subscription.active" || type === "subscription.updated") {
    status = "active";
  } else if (type === "subscription.canceled" || type === "subscription.revoked") {
    status = "canceled";
  }
  if (!status) {
    return null;
  }

  return {
    userId: metadata.macUserId,
    email: typeof metadata.email === "string" ? metadata.email : null,
    status,
    periodStart: stringOrNull(data?.current_period_start),
    periodEnd: stringOrNull(data?.current_period_end),
    polarCustomerId: stringOrNull(data?.customer_id) ?? stringOrNull(customer?.id),
    providerEventAt: stringOrNull(data?.created_at) ?? stringOrNull(data?.updated_at) ?? stringOrNull(eventRecord.created_at) ?? stringOrNull(eventRecord.timestamp),
    providerEventId: stringOrNull(data?.id) ?? stringOrNull(eventRecord.id),
  };
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function webhookTimestampIso(value: string | null): string | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}
