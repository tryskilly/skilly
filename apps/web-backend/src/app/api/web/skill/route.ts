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

  const repo = getRepo();
  const project = await repo.getProjectBySkillId(auth.tenant.id, skillId);
  const legacySkill = project ? null : await repo.getTenantSkill(auth.tenant.id, skillId);
  const skillContent = project?.skillContent ?? legacySkill?.content ?? "";
  if (!skillContent) {
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
    skill_id: skillId,
    project_id: project?.id,
    content_length: skillContent.length,
    source_surface: "web_backend",
  });
  return NextResponse.json({ skillId, projectId: project?.id ?? null, content: skillContent }, { status: 200, headers });
}
