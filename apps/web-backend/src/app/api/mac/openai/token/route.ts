// GET /api/mac/openai/token — Mac-compatible Realtime token relay.
// Verifies Studio sessions locally; compatible legacy sessions are also checked
// locally during the desktop release transition.

import { NextResponse, type NextRequest } from "next/server";
import { hostedOpenAIKeyCandidates, mintHostedRealtimeToken, TokenMintError } from "@/domain/openaiToken";
import { authenticateMacRequest, authorizeHostedAccess, selectMacRealtimeModel } from "@/lib/macSession";
import { normalizeLegacyTrialSeconds } from "@/domain/personalAccess";
import { requiresMacUpdate } from "@/domain/macMinimumBuild";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Raise MAC_MINIMUM_BUILD in Vercel to force v3.6+ clients to update.
  if (requiresMacUpdate(request.headers.get("x-skilly-build"))) {
    return NextResponse.json({ error: "update_required", code: "update_required" }, { status: 426 });
  }

  const migrationMarker = request.headers.get("x-skilly-client-migration");
  const legacyTrialSeconds = request.headers.get("x-skilly-legacy-trial-seconds");
  if (migrationMarker === "v1" && legacyTrialSeconds == null) {
    return NextResponse.json({ error: "legacy trial seconds required", code: "invalid_migration_marker" }, { status: 400 });
  }
  if (legacyTrialSeconds != null && normalizeLegacyTrialSeconds(legacyTrialSeconds) == null) {
    return NextResponse.json({ error: "invalid legacy trial seconds", code: "invalid_migration_marker" }, { status: 400 });
  }
  const access = await authorizeHostedAccess({
    userId: session.userId,
    email: session.email,
    source: "relay",
    migrationMarker,
    legacyTrialSecondsUsed: legacyTrialSeconds,
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.code, code: access.code }, { status: access.status });
  }

  const apiKeys = hostedOpenAIKeyCandidates(process.env);
  if (apiKeys.length === 0) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const model = selectMacRealtimeModel(new URL(request.url).searchParams.get("model"));
    const token = await mintHostedRealtimeToken({ apiKeys, model });
    await captureServerEvent("mac_realtime_token_minted", {
      workos_user_id: session.userId,
      source_surface: "studio_backend",
    });
    return NextResponse.json({
      clientSecret: token.clientSecret,
      expiresAt: token.expiresAt,
      model: token.model,
      accessMode: access.accessMode,
      remainingSeconds: access.remainingSeconds,
      sessionId: access.sessionId,
      periodStart: access.periodStart,
      periodEnd: access.periodEnd,
    });
  } catch (error) {
    const quotaExhausted = error instanceof TokenMintError && error.quotaExhausted;
    await captureServerEvent("mac_realtime_token_failed", {
      workos_user_id: session.userId,
      status: error instanceof TokenMintError ? error.upstreamStatus : undefined,
      source_surface: "studio_backend",
      reason: quotaExhausted ? "openai_quota_exhausted" : "mint_failed",
    });
    if (quotaExhausted) {
      return NextResponse.json(
        { error: "OpenAI has no credits remaining", code: "openai_quota_exhausted" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "failed to mint realtime token" }, { status: 502 });
  }
}
