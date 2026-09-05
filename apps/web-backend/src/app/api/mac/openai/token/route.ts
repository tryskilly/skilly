// GET /api/mac/openai/token — Mac-compatible Realtime token relay.
// Verifies Studio sessions locally; compatible legacy sessions are also checked
// locally during the desktop release transition.

import { NextResponse, type NextRequest } from "next/server";
import { mintRealtimeToken, TokenMintError } from "@/domain/openaiToken";
import { authenticateMacRequest, selectMacOpenAIAPIKey, selectMacRealtimeModel } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = selectMacOpenAIAPIKey();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const model = selectMacRealtimeModel(new URL(request.url).searchParams.get("model"));
    const token = await mintRealtimeToken({ apiKey, model });
    await captureServerEvent("mac_realtime_token_minted", {
      workos_user_id: session.userId,
      source_surface: "studio_backend",
    });
    return NextResponse.json({
      clientSecret: token.clientSecret,
      expiresAt: token.expiresAt,
      model: token.model,
    });
  } catch (error) {
    await captureServerEvent("mac_realtime_token_failed", {
      workos_user_id: session.userId,
      status: error instanceof TokenMintError ? error.upstreamStatus : undefined,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "failed to mint realtime token" }, { status: 502 });
  }
}
