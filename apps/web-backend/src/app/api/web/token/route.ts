// POST /api/web/token — mint an ephemeral OpenAI Realtime token for a widget
// session. Validates the publishable key + origin + quota, then mints. The raw
// OPENAI_API_KEY never leaves the server. Successor to the Worker's /openai/token.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { mintTokenForRequest } from "@/tenantService";
import { corsHeaders, extractAppId, extractKey, extractOrigin } from "@/http";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs"; // pg + crypto need the Node runtime
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(extractOrigin(request)) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = extractOrigin(request);
  const rawKey = extractKey(request);
  const appId = extractAppId(request);

  // Auth/origin are validated inside the service first; the missing-key case is
  // handled there (after auth) so bad requests get 401/403 rather than 500.
  const outcome = await mintTokenForRequest(getRepo(), {
    rawKey,
    origin,
    appId,
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  });
  await captureServerEvent("web_sdk_token_mint_finished", {
    tenant_id: outcome.tenantId,
    status: outcome.status,
    ok: outcome.status === 200,
    request_surface: origin ? "web" : "native",
    origin_present: Boolean(origin),
    app_id_present: Boolean(appId),
    source_surface: "web_backend",
  });
  return NextResponse.json(outcome.body, { status: outcome.status, headers: corsHeaders(origin) });
}
