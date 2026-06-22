// POST /api/web/checkout — start a Polar checkout for the current dashboard
// tenant (not the widget). Returns the hosted checkout URL to redirect to. The
// tenant id is attached as metadata so the webhook can apply the plan on success.

import { NextResponse, type NextRequest } from "next/server";
import { buildCheckoutBody, resolveBuilderPlan } from "@/domain/billing";
import { captureServerEvent } from "@/lib/analytics";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { publicUrl } from "@/lib/requestOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireDashboardSession();
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const apiBase = process.env.POLAR_API_BASE ?? "https://api.polar.sh";
  const tenantId = session.tenantId;
  const payload = (await request.json().catch(() => ({}))) as { plan?: string };
  const plan = resolveBuilderPlan(payload.plan, process.env);
  if (!accessToken || !plan?.productId) {
    await captureServerEvent("dashboard_checkout_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      reason: "billing_not_configured",
      requested_plan: payload.plan ?? "starter",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }

  const body = buildCheckoutBody({
    productId: plan.productId,
    tenantId,
    plan: plan.id,
    planCapSeconds: plan.capSeconds,
    successUrl: publicUrl(request, "/dashboard").toString(),
  });
  await captureServerEvent("dashboard_checkout_started", {
    tenant_id: tenantId,
    account_email: session.email ?? undefined,
    plan: plan.id,
    cap_seconds: plan.capSeconds,
    source_surface: "web_dashboard",
  });

  const response = await fetch(`${apiBase}/v1/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await captureServerEvent("dashboard_checkout_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      status: response.status,
      reason: "polar_non_2xx",
      plan: plan.id,
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }

  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  await captureServerEvent("dashboard_checkout_url_created", {
    tenant_id: tenantId,
    account_email: session.email ?? undefined,
    plan: plan.id,
    source_surface: "web_backend",
  });
  return NextResponse.json({ url: checkout.url ?? checkout.checkout_url ?? null }, { status: 200 });
}
