// POST /api/mac/usage — best-effort Mac session telemetry sink.
// This is intentionally additive: failures here should not block the Mac app's
// voice path once the app starts reporting to Studio.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateMacRequestWithWorkerFallback, recordMacUsage } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await authenticateMacRequestWithWorkerFallback(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seconds?: unknown;
    result?: unknown;
    source?: unknown;
    model?: unknown;
    audioInputTokens?: unknown;
    audioOutputTokens?: unknown;
    textInputTokens?: unknown;
    textOutputTokens?: unknown;
    cachedInputTokens?: unknown;
    totalTokens?: unknown;
    estimatedCostUsd?: unknown;
  };
  const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));
  const result = typeof body.result === "string" ? body.result : null;
  const source = typeof body.source === "string" ? body.source : null;
  const model = typeof body.model === "string" ? body.model : null;
  const audioInputTokens = optionalNonNegativeInt(body.audioInputTokens);
  const audioOutputTokens = optionalNonNegativeInt(body.audioOutputTokens);
  const textInputTokens = optionalNonNegativeInt(body.textInputTokens);
  const textOutputTokens = optionalNonNegativeInt(body.textOutputTokens);
  const cachedInputTokens = optionalNonNegativeInt(body.cachedInputTokens);
  const totalTokens = optionalNonNegativeInt(body.totalTokens);
  const estimatedCostUsd = typeof body.estimatedCostUsd === "string" ? body.estimatedCostUsd : null;

  await recordMacUsage({
    userId: session.userId,
    email: session.email,
    seconds,
    result,
    source,
    model,
    audioInputTokens,
    audioOutputTokens,
    textInputTokens,
    textOutputTokens,
    cachedInputTokens,
    totalTokens,
    estimatedCostUsd,
  });
  await captureServerEvent("mac_session_usage_reported", {
    workos_user_id: session.userId,
    seconds,
    result: result ?? undefined,
    source: source ?? undefined,
    model: model ?? undefined,
    audio_input_tokens: audioInputTokens ?? undefined,
    audio_output_tokens: audioOutputTokens ?? undefined,
    text_input_tokens: textInputTokens ?? undefined,
    text_output_tokens: textOutputTokens ?? undefined,
    cached_input_tokens: cachedInputTokens ?? undefined,
    total_tokens: totalTokens ?? undefined,
    estimated_cost_usd: estimatedCostUsd ?? undefined,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ ok: true, recordedSeconds: seconds });
}

function optionalNonNegativeInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}
