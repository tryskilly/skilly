import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import { Card, PageHeader, SectionHeader } from "../ui";
import { SkillEditor } from "./SkillEditor";

export const dynamic = "force-dynamic";

export default async function SkillPage() {
  const skill = await getRepo().getTenantSkill(await getCurrentDashboardTenantId(), DEFAULT_SKILL_ID);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenant workspace"
        title="Teaching skill"
        description="Edit the SKILL.md that becomes this tenant's companion instructions after safety validation."
      />

      <Card>
        <SectionHeader
          title="SKILL.md editor"
          description="This content is served to the web SDK and composed with the page digest before a live turn starts."
        />
        <SkillEditor initialContent={skill?.content ?? ""} />
      </Card>
    </div>
  );
}
