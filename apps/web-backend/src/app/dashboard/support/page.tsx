import { Mail, ShieldCheck, Wrench } from "lucide-react";
import { ButtonLink, PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        eyebrowTone="neutral"
        title="Get help with Studio."
        description="Use these paths when setup, billing, authentication, or the widget runtime is not behaving as expected."
        action={
          <ButtonLink href="/dashboard/status" variant="secondary">
            Check status
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelBody>
            <Wrench className="mb-3 text-amber-300" size={20} />
            <div className="font-bold text-gray-100">Setup issue</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">Check allowed surfaces, publishable keys, install snippet, and project skill readiness.</p>
            <ButtonLink href="/dashboard/setup" variant="secondary" className="mt-4">
              Open setup
            </ButtonLink>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <ShieldCheck className="mb-3 text-amber-300" size={20} />
            <div className="font-bold text-gray-100">Auth or tenant issue</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">Review account state, active workspace, role, WorkOS membership, and tenant identifiers.</p>
            <ButtonLink href="/dashboard/settings" variant="secondary" className="mt-4">
              Open settings
            </ButtonLink>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <Mail className="mb-3 text-amber-300" size={20} />
            <div className="font-bold text-gray-100">Contact</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">For now, support is handled directly while Studio is in beta.</p>
            <a className="mt-4 inline-flex h-[38px] items-center justify-center rounded-[9px] border border-white/[0.11] bg-white/[0.055] px-[13px] text-sm font-bold text-gray-200 transition hover:bg-white/[0.085]" href="mailto:support@tryskilly.app">
              Email support
            </a>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Beta support note" action={<StatusPill tone="amber" label="Beta" showDot />} />
        <PanelBody>
          <p className="text-sm leading-relaxed text-gray-300">
            When reporting a problem, include the active workspace, project skill ID, browser, page URL, and what happened during the last widget test.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
