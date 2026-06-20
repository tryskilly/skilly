// GET /api/dashboard/test-widget/api/web/skill?skill=<id> — serve a tenant
// skill to Studio's in-dashboard test widget using dashboard session auth.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { getDashboardSession } from "@/lib/dashboardAuth";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const repo = getRepo();
  const requestedSkillId = request.nextUrl.searchParams.get("skill")?.trim();
  const selection = await getDashboardSkillSelection(repo, session.tenantId);
  const skill =
    requestedSkillId && requestedSkillId !== selection.skillId
      ? await repo.getTenantSkill(session.tenantId, requestedSkillId)
      : selection.skill;

  if (!skill) {
    return NextResponse.json({ error: "skill not found" }, { status: 404 });
  }

  return NextResponse.json({ skillId: skill.skillId, content: skill.content });
}
