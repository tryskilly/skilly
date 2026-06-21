// GET /api/dashboard/test-widget/api/web/skill?skill=<id> — serve a tenant
// skill to Studio's in-dashboard test widget using dashboard session auth.

import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { getDashboardSession } from "@/lib/dashboardAuth";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STUDIO_GUIDE_SKILL_ID = "studio-guide";
const PREVIEW_SKILL_PREFIX = "preview-";
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

interface PreviewSkillPayload {
  host?: unknown;
  url?: unknown;
  title?: unknown;
  description?: unknown;
  goal?: unknown;
  headings?: unknown;
  callsToAction?: unknown;
  questions?: unknown;
  files?: unknown;
  surface?: unknown;
  tenantSkillId?: unknown;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asText(item)).filter(Boolean).slice(0, 8)
    : [];
}

function bulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None provided";
}

function decodePreviewSkill(requestedSkillId: string): { skillId: string; content: string } | null {
  if (!requestedSkillId.startsWith(PREVIEW_SKILL_PREFIX)) {
    return null;
  }

  try {
    const encoded = requestedSkillId.slice(PREVIEW_SKILL_PREFIX.length);
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as PreviewSkillPayload;
    const host = asText(payload.host, "the customer's website");
    const url = asText(payload.url);
    const title = asText(payload.title, host);
    const description = asText(payload.description);
    const goal = asText(payload.goal);
    const surface = asText(payload.surface) === "live" ? "live iframe preview" : "generated preview";
    const tenantSkillId = asText(payload.tenantSkillId, "default");
    const headings = asTextList(payload.headings);
    const callsToAction = asTextList(payload.callsToAction);
    const questions = asTextList(payload.questions);
    const files = asTextList(payload.files);

    const content = `---
id: customer-preview
name: ${host} Preview Assistant
description: Temporary customer website preview skill for Studio testing.
pointing_mode: always
---

## Teaching
You are Skilly embedded on ${host}, not Skilly Studio and not the dashboard setup assistant.

Use this temporary preview context as the source of truth for answers during this session. If the user asks what you can help with, answer based on ${host}, the page content, and the customer's goal below.

Do not answer as a Skilly dashboard administrator guide. Do not talk about Studio setup unless the user explicitly asks about installing or testing Skilly.

## Customer Website Context
- Host: ${host}
- URL: ${url || "Not provided"}
- Preview surface: ${surface}
- Tenant skill id being previewed: ${tenantSkillId}
- Page title: ${title}
- Page description: ${description || "Not provided"}
- Customer goal: ${goal || "Help visitors understand this page and choose the next action."}

## Page Headings
${bulletList(headings)}

## Calls To Action
${bulletList(callsToAction)}

## Likely Visitor Questions
${bulletList(questions)}

## Uploaded Context Files
${bulletList(files)}

## Behavior
Answer like the public website assistant that will later be installed on ${host}. Be concise, practical, and specific to this website. When the user asks how to use or evaluate the widget, explain what Skilly would say or do on this customer site.

If the PAGE ELEMENTS section mentions Studio dashboard controls, treat them as the preview container only. Do not let those dashboard elements override the customer website context above.

When pointing is useful, prefer these customer preview targets exactly as written:
- [POINT:customer-preview-heading:${title}]
- [POINT:customer-preview-primary-cta:Primary call to action]
- [POINT:customer-preview-description:Website description]
- [POINT:customer-preview-context:Skilly learning context]
- [POINT:customer-live-preview-frame:${host} live preview frame]

For questions or secondary sections, use PAGE ELEMENTS ids that start with customer-preview-question- or customer-preview-section-. Avoid pointing at sidebar, workspace switcher, account, or Studio setup controls unless the user explicitly asks about Studio itself.
`;

    return { skillId: "customer-preview", content };
  } catch {
    return null;
  }
}

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
  const previewSkill = requestedSkillId ? decodePreviewSkill(requestedSkillId) : null;
  if (previewSkill) {
    return NextResponse.json(previewSkill);
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
