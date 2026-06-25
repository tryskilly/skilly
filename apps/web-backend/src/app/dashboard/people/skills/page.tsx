import Link from "next/link";
import { listBundledSkills } from "@/lib/bundledSkills";
import { PageHeader, Panel, PanelBody, StatusPill } from "../../v2";

export const dynamic = "force-dynamic";

export default async function PeopleSkillsPage() {
  const skills = await listBundledSkills();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For people"
        eyebrowTone="neutral"
        title="My skills"
        description="This page shows the bundled Skilly Mac app skills that are available today. Private user-created skills are intentionally not shown until their backend storage exists."
        action={
          <Link
            href="/dashboard/people"
            className="inline-flex h-[38px] items-center justify-center rounded-[9px] border border-[#f50a87]/40 bg-[#f50a87] px-[13px] text-sm font-bold text-white shadow-[0_10px_24px_rgba(245,10,135,0.18)] transition hover:bg-[#d90877] active:scale-[0.98]"
          >
            New skill
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {skills.map((skill) => (
          <Panel
            key={skill.id}
            id={skill.id}
            className={skill.id === "blender-fundamentals" ? "scroll-mt-8 border-[#a78bfa]/35" : "scroll-mt-8"}
          >
            <PanelBody>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone="green" label="Bundled" />
                <StatusPill tone="neutral" label={skill.difficulty} />
              </div>
              <h2 className="mt-4 text-base font-extrabold tracking-[-0.02em] text-gray-100">{skill.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {skill.targetApp} · {skill.category} · {skill.estimatedHours}h · {skill.license}
              </p>
              <div className="mt-5 text-sm font-bold text-[#c4b5fd]">Available in the Mac app</div>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelBody>
          <div className="max-w-2xl">
            <h2 className="text-[15px] font-bold text-gray-100">Publishing gate</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Bundled skills come from the existing Skilly Mac app library. The UI does not expose private skill creation yet because the personal-skill backend, sharing, and review workflow still need to be added.
            </p>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
