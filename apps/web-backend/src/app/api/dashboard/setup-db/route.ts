import { NextResponse } from "next/server";
import { bootstrapControlPlaneDatabase } from "@/db/bootstrap";
import { requireDashboardSession } from "@/lib/dashboardAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  if (process.env.SKILLY_DB_SETUP_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 404 });
  }

  await requireDashboardSession("super_admin");
  await bootstrapControlPlaneDatabase();

  return NextResponse.json({ ok: true });
}
