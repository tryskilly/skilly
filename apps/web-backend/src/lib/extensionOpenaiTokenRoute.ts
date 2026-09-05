import { NextResponse, type NextRequest } from "next/server";
import { mintRealtimeToken, TokenMintError } from "@/domain/openaiToken";
import { authenticateExtensionRequest, selectExtensionOpenAIAPIKey } from "@/lib/extensionSession";
import { authorizeHostedAccess, type HostedAccessPreflight } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export interface ExtensionOpenAITokenDependencies {
  mintRealtimeToken: typeof mintRealtimeToken;
  captureServerEvent: typeof captureServerEvent;
  authorizeHostedAccess?: typeof authorizeHostedAccess;
}

const productionDependencies: ExtensionOpenAITokenDependencies = {
  mintRealtimeToken,
  captureServerEvent,
  authorizeHostedAccess,
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

  // Keep extension's established paid-only contract. Unlike desktop, it never finalizes the
  // one-time trial migration baseline.
  const access = dependencies.authorizeHostedAccess
    ? await dependencies.authorizeHostedAccess({ userId: session.userId, email: session.email, source: "extension" })
    : ({ allowed: true, sessionId: "legacy-test-session", source: "extension", accessMode: "paid", remainingSeconds: 10_800, periodStart: null, periodEnd: null } satisfies HostedAccessPreflight);
  if (!access.allowed) {
    return NextResponse.json({ error: access.code, code: access.code }, { status: access.status });
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
      accessMode: access.accessMode,
      remainingSeconds: access.remainingSeconds,
      sessionId: access.sessionId,
      periodStart: access.periodStart,
      periodEnd: access.periodEnd,
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
