// GET /api/extension/openai/token — mints an ephemeral OpenAI Realtime client secret for an
// authenticated extension user, so the raw API key never reaches the browser.
// Mirrors /api/mac/openai/token's response shape exactly.

import { NextResponse, type NextRequest } from "next/server";
import { mintRealtimeToken, TokenMintError } from "@/domain/openaiToken";
import { authenticateExtensionRequest, selectExtensionOpenAIAPIKey } from "@/lib/extensionSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Authenticate before touching configuration, so an unauthenticated caller can never tell a
  // configured server from an unconfigured one.
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = selectExtensionOpenAIAPIKey();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const token = await mintRealtimeToken({ apiKey });
    await captureServerEvent("extension_realtime_token_minted", {
      workos_user_id: session.userId,
      source_surface: "studio_backend",
    });
    return NextResponse.json({
      clientSecret: token.clientSecret,
      expiresAt: token.expiresAt,
      model: token.model,
    });
  } catch (error) {
    await captureServerEvent("extension_realtime_token_failed", {
      workos_user_id: session.userId,
      status: error instanceof TokenMintError ? error.upstreamStatus : undefined,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "failed to mint realtime token" }, { status: 502 });
  }
}
