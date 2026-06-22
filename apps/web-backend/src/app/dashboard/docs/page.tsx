import { BookOpen, Code2, Globe, KeyRound, Mic2, ScrollText } from "lucide-react";
import { ButtonLink, PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";

export const dynamic = "force-dynamic";

const docs = [
  {
    title: "Teach",
    description: "Write the project SKILL.md: what Skilly should answer, explain, and point at.",
    href: "/dashboard/setup#teach",
    icon: ScrollText,
  },
  {
    title: "Allow",
    description: "Add the web origins or native app IDs that are allowed to mint widget sessions.",
    href: "/dashboard/setup#allow",
    icon: Globe,
  },
  {
    title: "Install",
    description: "Copy the snippet for this project and verify the publishable key is active.",
    href: "/dashboard/setup#install",
    icon: Code2,
  },
  {
    title: "Test",
    description: "Open the live preview, grant mic access, and run a real customer-site session.",
    href: "/dashboard/widget",
    icon: Mic2,
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reference"
        eyebrowTone="neutral"
        title="Studio docs."
        description="The short path for getting a project from draft to a working Skilly install."
        action={
          <ButtonLink href="/dashboard/setup" variant="primary">
            Open setup
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {docs.map((item) => {
          const Icon = item.icon;
          return (
            <Panel key={item.title}>
              <PanelBody>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] border border-amber-500/25 bg-amber-500/10 text-amber-300">
                  <Icon size={19} />
                </div>
                <div className="text-lg font-bold text-gray-100">{item.title}</div>
                <p className="mt-2 min-h-[42px] text-sm leading-relaxed text-muted">{item.description}</p>
                <ButtonLink href={item.href} variant="secondary" className="mt-4">
                  Open
                </ButtonLink>
              </PanelBody>
            </Panel>
          );
        })}
      </div>

      <Panel>
        <PanelHeader
          title="Runtime contract"
          description="These are the pieces that must line up before a customer site can start sessions."
          action={<StatusPill tone="green" label="Enforced per token" showDot />}
        />
        <PanelBody>
          <div className="grid gap-3 text-sm text-gray-300 md:grid-cols-3">
            <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-3">
              <KeyRound className="mb-2 text-amber-300" size={18} />
              Publishable key identifies the workspace.
            </div>
            <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-3">
              <Globe className="mb-2 text-amber-300" size={18} />
              Allowed origins or app IDs scope where it can run.
            </div>
            <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-3">
              <BookOpen className="mb-2 text-amber-300" size={18} />
              Project SKILL.md controls how Skilly answers and points.
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
