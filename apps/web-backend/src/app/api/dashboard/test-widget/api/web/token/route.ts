// POST /api/dashboard/test-widget/api/web/token — dashboard-session variant of
// the public widget token endpoint. Used by Studio's in-dashboard test widget
// so customers can validate their current tenant without recovering a raw key.

import { NextResponse } from "next/server";
import { getRepo } from "@/db";
import { isOverQuota, remainingSeconds } from "@/domain/quota";
import { mintRealtimeToken } from "@/domain/openaiToken";
import { captureServerEvent } from "@/lib/analytics";
import { getDashboardSession } from "@/lib/dashboardAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstreamStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "upstreamStatus" in error) {
    const value = (error as { upstreamStatus?: unknown }).upstreamStatus;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

export async function POST(): Promise<NextResponse> {
  const session = await getDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const repo = getRepo();
  const tenant = await repo.getTenant(session.tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "tenant not found" }, { status: 404 });
  }

  const usageSecondsThisPeriod = await repo.getUsageSecondsThisPeriod(tenant.id);
  const quotaInput = { usageSecondsThisPeriod, capSeconds: tenant.usageCapSeconds };
  if (isOverQuota(quotaInput)) {
    await captureServerEvent("dashboard_test_widget_token_rejected", {
      tenant_id: tenant.id,
      account_email: session.email ?? undefined,
      status: 429,
      reason: "quota",
      source_surface: "studio_dashboard",
    });
    return NextResponse.json({ error: "monthly usage quota reached" }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "server is missing OPENAI_API_KEY" }, { status: 500 });
  }

  try {
    const token = await mintRealtimeToken({ apiKey });
    await repo.recordUsage({ tenantId: tenant.id, kind: "token_mint", seconds: 0 });
    await captureServerEvent("dashboard_test_widget_token_minted", {
      tenant_id: tenant.id,
      account_email: session.email ?? undefined,
      source_surface: "studio_dashboard",
    });
    return NextResponse.json({
      clientSecret: token.clientSecret,
      expiresAt: token.expiresAt,
      model: token.model,
      remainingSeconds: remainingSeconds(quotaInput),
    });
  } catch (error) {
    await captureServerEvent("dashboard_test_widget_token_failed", {
      tenant_id: tenant.id,
      account_email: session.email ?? undefined,
      status: upstreamStatus(error),
      source_surface: "studio_dashboard",
    });
    return NextResponse.json({ error: "failed to mint realtime token" }, { status: 502 });
  }
}
