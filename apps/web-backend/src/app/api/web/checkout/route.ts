// POST /api/web/checkout — start a Polar checkout for the current dashboard
// tenant (not the widget). Returns the hosted checkout URL to redirect to. The
// tenant id is attached as metadata so the webhook can apply the plan on success.

import { NextResponse, type NextRequest } from "next/server";
import { buildCheckoutBody, isBuilderPlanId, isValidBillingUrl, resolveBuilderPlan } from "@/domain/billing";
import { captureServerEvent } from "@/lib/analytics";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { publicUrl } from "@/lib/requestOrigin";
import { logBillingFailure } from "@/lib/billingDiagnostics";
import { validateBillingEnvironment } from "@/domain/billingEnvironment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireDashboardSession();
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const tenantId = session.tenantId;
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const payload = rawPayload as { plan?: string };
  if ("plan" in payload && payload.plan !== undefined && !isBuilderPlanId(payload.plan)) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }
  const plan = resolveBuilderPlan(payload.plan, process.env);
  const billingEnv = validateBillingEnvironment({ surface: "builder", productId: plan?.productId, host: request.headers.get("host") });
  if (!billingEnv.ok || !accessToken || !plan?.productId) {
    logBillingFailure({ surface: "builder_checkout", reason: "billing_not_configured" });
    await captureServerEvent("dashboard_checkout_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      reason: "billing_not_configured",
      requested_plan: payload.plan ?? "starter",
      source_surface: "web_backend",
    }, session.workosUserId);
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
  }, session.workosUserId);

  let response: Response;
  try {
    response = await fetch(`${billingEnv.apiBase}/v1/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    logBillingFailure({ surface: "builder_checkout", reason: "provider_network_error" });
    await captureServerEvent("dashboard_checkout_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      reason: "provider_network_error",
      plan: plan.id,
      source_surface: "web_backend",
    }, session.workosUserId);
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  if (!response.ok) {
    logBillingFailure({ surface: "builder_checkout", status: response.status, reason: "provider_non_2xx" });
    await captureServerEvent("dashboard_checkout_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      status: response.status,
      reason: "polar_non_2xx",
      plan: plan.id,
      source_surface: "web_backend",
    }, session.workosUserId);
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }

  let checkout: { url?: unknown; checkout_url?: unknown };
  try {
    checkout = (await response.json()) as { url?: unknown; checkout_url?: unknown };
  } catch {
    logBillingFailure({ surface: "builder_checkout", status: response.status, reason: "provider_invalid_json" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  if (!checkout || typeof checkout !== "object" || Array.isArray(checkout)) {
    logBillingFailure({ surface: "builder_checkout", status: response.status, reason: "provider_missing_url" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  const checkoutUrl = checkout.url ?? checkout.checkout_url;
  if (typeof checkoutUrl !== "string") {
    logBillingFailure({ surface: "builder_checkout", status: response.status, reason: "provider_missing_url" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  if (!isValidBillingUrl(checkoutUrl)) {
    logBillingFailure({ surface: "builder_checkout", status: response.status, reason: "provider_invalid_url" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  await captureServerEvent("dashboard_checkout_url_created", {
    tenant_id: tenantId,
    account_email: session.email ?? undefined,
    plan: plan.id,
    source_surface: "web_backend",
  }, session.workosUserId);
  return NextResponse.json({ url: checkoutUrl }, { status: 200 });
}
