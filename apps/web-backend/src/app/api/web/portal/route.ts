// POST /api/web/portal — open a Polar customer-portal session for the current
// dashboard tenant so they can manage (upgrade/cancel) their subscription.
// Requires a stored polar_customer_id (captured from the subscription webhook).
// If none is stored we fall back to starting a checkout (first-time upgrade).

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
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

  if (!accessToken) {
    await captureServerEvent("dashboard_portal_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      reason: "billing_not_configured",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }

  const tenant = await getRepo().getTenant(tenantId);
  const polarCustomerId = tenant?.polarCustomerId ?? null;
  if (!polarCustomerId) {
    // No subscription yet → there's nothing to manage; tell the client to start checkout.
    await captureServerEvent("dashboard_portal_no_customer", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      source_surface: "web_backend",
    });
    return NextResponse.json(
      { error: "no_subscription", fallback: "checkout" },
      { status: 409 },
    );
  }

  const returnUrl = publicUrl(request, "/dashboard/billing").toString();
  const response = await fetch(`${apiBase}/v1/customer-portal-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: polarCustomerId, return_url: returnUrl }),
  });

  if (!response.ok) {
    await captureServerEvent("dashboard_portal_failed", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      status: response.status,
      reason: "polar_non_2xx",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "portal session failed" }, { status: 502 });
  }

  const portal = (await response.json()) as { url?: string };
  await captureServerEvent("dashboard_portal_opened", {
    tenant_id: tenantId,
    account_email: session.email ?? undefined,
    source_surface: "web_dashboard",
  });
  return NextResponse.json({ url: portal.url ?? null }, { status: 200 });
}
