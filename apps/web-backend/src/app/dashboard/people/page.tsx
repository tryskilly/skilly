import Link from "next/link";
import { BookOpen, MousePointer2 } from "lucide-react";
import { listBundledSkills } from "@/lib/bundledSkills";
import { ButtonLink, PageHeader, Panel, PanelBody, StatusPill } from "../v2";

export const dynamic = "force-dynamic";

export default async function PeopleCreatePage() {
  const bundledSkills = await listBundledSkills();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For people"
        eyebrowTone="neutral"
        title="Start from an existing Skilly skill"
        description="The People surface is connected to the bundled Mac skill library today. Private generated skills need the personal-skill backend before they are exposed as a working control."
        action={<ButtonLink href="/dashboard/people/skills" variant="secondary">View library</ButtonLink>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelBody>
            <div className="grid gap-3">
              {bundledSkills.slice(0, 5).map((skill) => (
                <Link
                  key={skill.id}
                  href={`/dashboard/people/skills#${skill.id}`}
                  className="flex items-center gap-3 rounded-[12px] border border-line-soft bg-white/[0.035] px-4 py-3 transition hover:bg-white/[0.055]"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-white/[0.045]">
                    <BookOpen size={18} className="text-[#c4b5fd]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-gray-100">{skill.name}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      {skill.targetApp} · {skill.category} · {skill.estimatedHours}h
                    </div>
                  </div>
                  <StatusPill tone="green" label="Bundled" />
                </Link>
              ))}
            </div>
          </PanelBody>
        </Panel>

        <Panel className="border-[#a78bfa]/30">
          <PanelBody>
            <div className="mb-3 inline-flex rounded-full border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-2.5 py-1 text-xs font-bold text-[#c4b5fd]">
              Real status
            </div>
            <h2 className="text-lg font-extrabold tracking-[-0.02em] text-gray-100">Connected now</h2>
            <div className="mt-4 grid gap-3 text-sm text-gray-300">
              <div className="flex gap-3">
                <BookOpen size={17} className="mt-0.5 shrink-0 text-[#c4b5fd]" />
                <span>Bundled SKILL.md files are read from the repo and shown in the library.</span>
              </div>
              <div className="flex gap-3">
                <MousePointer2 size={17} className="mt-0.5 shrink-0 text-[#c4b5fd]" />
                <span>Voice, pointing, and progress still run in the Mac app for these skills.</span>
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
