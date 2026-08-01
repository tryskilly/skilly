import { NextResponse, type NextRequest } from "next/server";
import { mintRealtimeToken, TokenMintError } from "@/domain/openaiToken";
import { authenticateExtensionRequest, selectExtensionOpenAIAPIKey } from "@/lib/extensionSession";
import { captureServerEvent } from "@/lib/analytics";

export interface ExtensionOpenAITokenDependencies {
  mintRealtimeToken: typeof mintRealtimeToken;
  captureServerEvent: typeof captureServerEvent;
}

const productionDependencies: ExtensionOpenAITokenDependencies = {
  mintRealtimeToken,
  captureServerEvent,
};

export async function handleExtensionOpenAITokenRequest(
  request: NextRequest,
  dependencies: ExtensionOpenAITokenDependencies = productionDependencies,
): Promise<NextResponse> {
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
    const token = await dependencies.mintRealtimeToken({ apiKey });
    await dependencies.captureServerEvent("extension_realtime_token_minted", {
      workos_user_id: session.userId,
      source_surface: "studio_backend",
    });
    return NextResponse.json({
      clientSecret: token.clientSecret,
      expiresAt: token.expiresAt,
      model: token.model,
    });
  } catch (error) {
    await dependencies.captureServerEvent("extension_realtime_token_failed", {
      workos_user_id: session.userId,
      status: error instanceof TokenMintError ? error.upstreamStatus : undefined,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "failed to mint realtime token" }, { status: 502 });
  }
}
