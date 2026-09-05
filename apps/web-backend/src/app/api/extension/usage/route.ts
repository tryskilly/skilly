// POST /api/extension/usage — best-effort usage telemetry, tagged source: "extension" so it is
// distinguishable from Mac's "relay"/"byok" sources in the shared mac_usage_events table
// (shared entitlement, per-surface usage tagging).
//
// Like /api/mac/usage this is intentionally additive: nothing here should be able to block the
// extension's voice path, so a malformed body degrades to zero seconds rather than erroring.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateExtensionRequest } from "@/lib/extensionSession";
import { InvalidUsageSessionError, recordMacUsage } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    // Keep the pre-v1 compatibility path: old clients sent best-effort malformed telemetry.
    parsedBody = {};
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "usage body must be an object" }, { status: 400 });
  }
  const body = parsedBody as { seconds?: unknown; result?: unknown; model?: unknown; eventId?: unknown; sessionId?: unknown };
  const numericSeconds = Number(body.seconds);
  const seconds = Number.isFinite(numericSeconds) ? Math.max(0, Math.round(numericSeconds)) : 0;
  const result = typeof body.result === "string" ? body.result : null;
  const model = typeof body.model === "string" ? body.model : null;
  const eventId = optionalIdentifier(body.eventId);
  const sessionId = optionalIdentifier(body.sessionId);
  if ((body.eventId != null && !eventId) || (body.sessionId != null && !sessionId)) {
    return NextResponse.json({ error: "eventId and sessionId must be non-empty strings" }, { status: 400 });
  }

  // `source` is deliberately not read from the body — a client must not be able to choose which
  // surface its own usage is attributed to.
  let recorded: { duplicate: boolean; recordedSeconds: number };
  try {
    recorded = (await recordMacUsage({
      userId: session.userId,
      email: session.email,
      seconds,
      result,
      source: "extension",
      model,
      eventId,
      sessionId,
    })) ?? { duplicate: false, recordedSeconds: seconds };
  } catch (error) {
    if (error instanceof InvalidUsageSessionError) {
      return NextResponse.json({ error: error.message, code: "invalid_usage_session" }, { status: 400 });
    }
    throw error;
  }
  await captureServerEvent("extension_session_usage_reported", {
    workos_user_id: session.userId,
    seconds,
    result: result ?? undefined,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ ok: true, recordedSeconds: recorded.recordedSeconds, ...(eventId ? { duplicate: recorded.duplicate } : {}) });
}

function optionalIdentifier(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 ? value.trim() : null;
}
