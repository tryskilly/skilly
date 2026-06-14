import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import { Badge, Card, SectionHeader } from "../ui";
import { SkillEditor } from "./SkillEditor";

export const dynamic = "force-dynamic";

export default async function SkillPage() {
  const skill = await getRepo().getTenantSkill(await getCurrentDashboardTenantId(), DEFAULT_SKILL_ID);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="amber">Tenant workspace</Badge>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-neutral-100">Teaching skill</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Edit the SKILL.md that becomes this tenant&apos;s companion instructions after safety validation.
          </p>
        </div>
      </section>

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
