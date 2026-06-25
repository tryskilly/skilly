import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";
import { SkillEditor } from "./SkillEditor";
import { ProjectContextPanel } from "../ProjectContextPanel";

export const dynamic = "force-dynamic";

export default async function SkillPage() {
  const repo = getRepo();
  const project = await repo.ensureDefaultProject(await getCurrentDashboardTenantId());
  const hasContent = Boolean(project.skillContent.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For builders · Teach"
        title="Teach this project."
        description="Every site or app needs its own SKILL.md: what Skilly should explain, what it should point at, and how it should answer visitors."
        action={<StatusPill tone={hasContent ? "green" : "amber"} label={hasContent ? "Saved" : "Empty"} showDot />}
      />

      <ProjectContextPanel skillId={project.skillId} surfaces={["Teach", "Style", "Allow", "Install", "Test"]} />

      <Panel>
        <PanelHeader
          title="SKILL.md editor"
          description={`Plain-markdown teaching content for ${project.skillId}. The safety scan runs on every save before this project can go live.`}
        />
        <PanelBody>
          <SkillEditor initialContent={project.skillContent} />
        </PanelBody>
      </Panel>
    </div>
  );
}
