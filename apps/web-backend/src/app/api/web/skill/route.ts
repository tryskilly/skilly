// GET /api/web/skill?skill=<id> — serve the tenant's compiled SKILL.md to the
// widget after validating its publishable key + origin.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { authenticateWebRequest } from "@/tenantService";
import { corsHeaders, extractAppId, extractKey, extractOrigin } from "@/http";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(extractOrigin(request)) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = extractOrigin(request);
  const rawKey = extractKey(request);
  const headers = corsHeaders(origin);

  const auth = await authenticateWebRequest(getRepo(), { rawKey, origin, appId: extractAppId(request) });
  if (!auth.ok) {
    await captureServerEvent("web_sdk_skill_fetch_rejected", {
      status: auth.status,
      origin_present: Boolean(origin),
      app_id_present: Boolean(extractAppId(request)),
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  const skillId = request.nextUrl.searchParams.get("skill");
  if (!skillId) {
    await captureServerEvent("web_sdk_skill_fetch_failed", {
      tenant_id: auth.tenant.id,
      status: 400,
      reason: "missing_skill_id",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "missing ?skill" }, { status: 400, headers });
  }

  const skill = await getRepo().getTenantSkill(auth.tenant.id, skillId);
  if (!skill) {
    await captureServerEvent("web_sdk_skill_fetch_failed", {
      tenant_id: auth.tenant.id,
      status: 404,
      skill_id: skillId,
      reason: "not_found",
      source_surface: "web_backend",
    });
    return NextResponse.json({ error: "skill not found" }, { status: 404, headers });
  }

  await captureServerEvent("web_sdk_skill_fetched", {
    tenant_id: auth.tenant.id,
    skill_id: skill.skillId,
    content_length: skill.content.length,
    source_surface: "web_backend",
  });
  return NextResponse.json({ skillId: skill.skillId, content: skill.content }, { status: 200, headers });
}
