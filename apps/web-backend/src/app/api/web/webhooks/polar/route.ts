// POST /api/web/webhooks/polar — Polar subscription webhooks (Standard Webhooks
// signature). On an active subscription we grant the tenant the plan cap; on
// cancel/revoke we drop it to 0. The tenant id rides in the checkout metadata.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { interpretSubscriptionEvent, verifyWebhookSignature } from "@/domain/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAN_CAP_SECONDS = 36_000; // 10h/month

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
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
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const activeCapSeconds = Number(process.env.POLAR_PLAN_CAP_SECONDS ?? DEFAULT_PLAN_CAP_SECONDS);
  const update = interpretSubscriptionEvent(event as Parameters<typeof interpretSubscriptionEvent>[0], activeCapSeconds);
  if (update) {
    await getRepo().setTenantUsageCap(update.tenantId, update.capSeconds);
  }

  return NextResponse.json({ ok: true, applied: Boolean(update) }, { status: 200 });
}
