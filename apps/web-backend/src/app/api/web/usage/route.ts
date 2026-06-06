// POST /api/web/usage — the widget reports session seconds at session end. These
// feed usage_events, which the quota engine (tenantService) already reads. Body:
// { seconds: number }. Validated against the tenant's publishable key + origin.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { authenticateWebRequest } from "@/tenantService";
import { corsHeaders, extractAppId, extractKey, extractOrigin } from "@/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORTED_SECONDS = 3600; // clamp a single report to one hour

export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(extractOrigin(request)) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = extractOrigin(request);
  const headers = corsHeaders(origin);

  const auth = await authenticateWebRequest(getRepo(), {
    rawKey: extractKey(request),
    origin,
    appId: extractAppId(request),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  const body = (await request.json().catch(() => ({}))) as { seconds?: unknown };
  const seconds = Math.max(0, Math.min(MAX_REPORTED_SECONDS, Math.round(Number(body.seconds) || 0)));

  await getRepo().recordUsage({ tenantId: auth.tenant.id, kind: "session_seconds", seconds });
  return NextResponse.json({ ok: true, recordedSeconds: seconds }, { status: 200, headers });
}
