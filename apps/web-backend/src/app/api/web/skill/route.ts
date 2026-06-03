// GET /api/web/skill?skill=<id> — serve the tenant's compiled SKILL.md to the
// widget after validating its publishable key + origin.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { authenticateWebRequest } from "@/tenantService";
import { corsHeaders, extractKey, extractOrigin } from "@/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(extractOrigin(request)) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = extractOrigin(request);
  const rawKey = extractKey(request);
  const headers = corsHeaders(origin);

  const auth = await authenticateWebRequest(getRepo(), { rawKey, origin });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  const skillId = request.nextUrl.searchParams.get("skill");
  if (!skillId) {
    return NextResponse.json({ error: "missing ?skill" }, { status: 400, headers });
  }

  const skill = await getRepo().getTenantSkill(auth.tenant.id, skillId);
  if (!skill) {
    return NextResponse.json({ error: "skill not found" }, { status: 404, headers });
  }

  return NextResponse.json({ skillId: skill.skillId, content: skill.content }, { status: 200, headers });
}
