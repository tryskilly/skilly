// GET /api/health — readiness probe. Does not expose secret values.

import { NextResponse } from "next/server";
import { getReadinessStatus } from "@/lib/readiness";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const status = await getReadinessStatus();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
