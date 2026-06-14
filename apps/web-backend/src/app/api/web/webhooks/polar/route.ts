// POST /api/web/webhooks/polar — Polar subscription webhooks (Standard Webhooks
// signature). On an active subscription we grant the tenant the plan cap; on
// cancel/revoke we drop it to 0. The tenant id rides in the checkout metadata.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { interpretSubscriptionEvent, verifyWebhookSignature } from "@/domain/billing";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAN_CAP_SECONDS = 36_000; // 10h/month

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
  const update = interpretSubscriptionEvent(event as Parameters<typeof interpretSubscriptionEvent>[0], activeCapSeconds);
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
      source_surface: "web_backend",
    });
  } else {
    await captureServerEvent("polar_webhook_ignored", {
      source_surface: "web_backend",
    });
  }

  return NextResponse.json({ ok: true, applied: Boolean(update) }, { status: 200 });
}
