// POST /api/mac/usage — best-effort Mac session telemetry sink.
// This is intentionally additive: failures here should not block the Mac app's
// voice path once the app starts reporting to Studio.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateMacRequest, recordMacUsage } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seconds?: unknown;
    result?: unknown;
  };
  const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));
  const result = typeof body.result === "string" ? body.result : null;

  await recordMacUsage({
    userId: session.userId,
    email: session.email,
    seconds,
    result,
  });
  await captureServerEvent("mac_session_usage_reported", {
    workos_user_id: session.userId,
    seconds,
    result: result ?? undefined,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ ok: true, recordedSeconds: seconds });
}
