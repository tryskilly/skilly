// GET /api/dashboard/test-widget/api/web/skill?skill=<id> — serve a tenant
// skill to Studio's in-dashboard test widget using dashboard session auth.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { getDashboardSession } from "@/lib/dashboardAuth";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STUDIO_GUIDE_SKILL_ID = "studio-guide";
const STUDIO_GUIDE_SKILL = `---
id: studio-guide
name: Skilly Studio Guide
description: Internal setup assistant for helping workspace admins configure Skilly Studio.
pointing_mode: always
---

## Teaching
You are Skilly's setup assistant inside Studio. Help the workspace admin complete configuration without confusing Studio setup with their public customer widget.

Focus on the current Studio surface: workspace switching, website preview, teaching skill setup, domain allowlist, API keys, install snippet, usage, billing, and settings.

Always explain the next action briefly and point at the relevant Studio control using the page's available data-skilly annotations when possible.

## Boundaries
Do not pretend to be the customer's public website assistant. When the user asks about testing their own website, direct them to the customer website preview/import area.

## Vocabulary
### Studio Assistant
The internal Skilly-owned guide that helps admins finish setup inside Studio.

### Customer Website Preview
The tenant-owned simulation where admins enter their website URL and product context to see how Skilly would guide visitors on their site.

### Teaching Skill
The tenant-owned instructions served to the public embedded widget.

### Install Snippet
The script tag the customer adds to their site after previewing and configuring Skilly.
`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const repo = getRepo();
  const requestedSkillId = request.nextUrl.searchParams.get("skill")?.trim();
  if (requestedSkillId === STUDIO_GUIDE_SKILL_ID) {
    return NextResponse.json({ skillId: STUDIO_GUIDE_SKILL_ID, content: STUDIO_GUIDE_SKILL });
  }

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
