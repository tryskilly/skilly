// POST /api/dashboard/test-widget/api/web/usage — meter usage from Studio's
// in-dashboard test widget against the logged-in tenant.

import { NextResponse } from "next/server";
import { getRepo } from "@/db";
import { captureServerEvent } from "@/lib/analytics";
import { getDashboardSession } from "@/lib/dashboardAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORTED_SECONDS = 3600;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seconds?: unknown;
    page?: unknown;
    domain?: unknown;
    durationSeconds?: unknown;
    result?: unknown;
  };
  const seconds = Math.max(0, Math.min(MAX_REPORTED_SECONDS, Math.round(Number(body.seconds) || 0)));
  const page = typeof body.page === "string" ? body.page.trim().slice(0, 512) || null : null;
  const domain = typeof body.domain === "string" ? body.domain.trim().slice(0, 253) || null : null;
  const durationSeconds =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds) && body.durationSeconds >= 0
      ? Math.min(MAX_REPORTED_SECONDS, Math.round(body.durationSeconds))
      : null;
  const validResults = new Set(["completed", "mic_denied", "error", "quota"]);
  const result =
    typeof body.result === "string" && validResults.has(body.result)
      ? (body.result as "completed" | "mic_denied" | "error" | "quota")
      : null;

  await getRepo().recordUsage({
    tenantId: session.tenantId,
    kind: "session_seconds",
    seconds,
    page,
    domain,
    durationSeconds,
    result,
  });
  await captureServerEvent("dashboard_test_widget_usage_reported", {
    tenant_id: session.tenantId,
    seconds,
    source_surface: "studio_dashboard",
  });
  return NextResponse.json({ ok: true, recordedSeconds: seconds });
}
