import { NextResponse, type NextRequest } from "next/server";
import { clearDashboardSession } from "@/lib/dashboardAuth";
import { publicUrl } from "@/lib/requestOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  await clearDashboardSession();
  return NextResponse.redirect(publicUrl(request, "/login"), { status: 303 });
}
