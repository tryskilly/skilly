// POST /api/extension/auth/exchange — the browser extension's login step. The extension itself
// opens WorkOS's authorize URL via chrome.identity.launchWebAuthFlow (WORKOS_CLIENT_ID is a
// public identifier, safe to bake into the extension's own config — the extension needs no
// secret to start this flow) and captures the `code` from the redirect. This route does the
// server-side half: exchange that code for the WorkOS user, then mint a session token the
// extension stores and sends as a Bearer token to every other /api/extension/* route.
import { NextResponse, type NextRequest } from "next/server";
import { exchangeWorkOSCode, WorkOSUpstreamError } from "@/lib/workosAuth";
import { mintExtensionSessionToken } from "@/lib/extensionSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : null;
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  let auth: Awaited<ReturnType<typeof exchangeWorkOSCode>>;
  try {
    auth = await exchangeWorkOSCode(code);
  } catch (error) {
    const status = error instanceof WorkOSUpstreamError ? error.status : 502;
    await captureServerEvent("extension_auth_exchange_failed", {
      status,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "authentication failed" }, { status: status === 502 ? 502 : 401 });
  }

  if (!auth.user.email) {
    return NextResponse.json({ error: "WorkOS account has no email" }, { status: 401 });
  }

  const { token, expiresAt } = mintExtensionSessionToken({ id: auth.user.id, email: auth.user.email });
  await captureServerEvent("extension_auth_exchange_succeeded", {
    workos_user_id: auth.user.id,
    source_surface: "studio_backend",
  });
  return NextResponse.json({ sessionToken: token, expiresAt, email: auth.user.email });
}
