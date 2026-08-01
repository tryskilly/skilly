// POST /api/extension/usage — best-effort usage telemetry, tagged source: "extension" so it is
// distinguishable from Mac's "relay"/"byok" sources in the shared mac_usage_events table
// (shared entitlement, per-surface usage tagging).
//
// Like /api/mac/usage this is intentionally additive: nothing here should be able to block the
// extension's voice path, so a malformed body degrades to zero seconds rather than erroring.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateExtensionRequest } from "@/lib/extensionSession";
import { recordMacUsage } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { seconds?: unknown; result?: unknown };
  const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));
  const result = typeof body.result === "string" ? body.result : null;

  // `source` is deliberately not read from the body — a client must not be able to choose which
  // surface its own usage is attributed to.
  await recordMacUsage({
    userId: session.userId,
    email: session.email,
    seconds,
    result,
    source: "extension",
    model: null,
  });
  await captureServerEvent("extension_session_usage_reported", {
    workos_user_id: session.userId,
    seconds,
    result: result ?? undefined,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ ok: true, recordedSeconds: seconds });
}
