import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import { PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";
import { SkillEditor } from "./SkillEditor";

export const dynamic = "force-dynamic";

export default async function SkillPage() {
  const skill = await getRepo().getTenantSkill(await getCurrentDashboardTenantId(), DEFAULT_SKILL_ID);
  const hasContent = Boolean(skill?.content.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching skill"
        title="Teach Skilly how to guide users."
        description="Define how Skilly explains, guides, and points inside your product. This SKILL.md is served to the web SDK and composed with the page digest before a live turn — validate before publishing changes."
        action={<StatusPill tone={hasContent ? "green" : "amber"} label={hasContent ? "Saved" : "Empty"} showDot />}
      />

      <Panel>
        <PanelHeader
          title="SKILL.md editor"
          description="Plain-markdown teaching content. The safety scan runs on every save (size limits + injection/exfiltration + raw-URL checks)."
        />
        <PanelBody>
          <SkillEditor initialContent={skill?.content ?? ""} />
        </PanelBody>
      </Panel>
    </div>
  );
}
