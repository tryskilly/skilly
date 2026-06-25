import { requireDashboardSession } from "@/lib/dashboardAuth";
import { DisplayRow, PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../../v2";

export const dynamic = "force-dynamic";

export default async function PeopleAccountPage() {
  const session = await requireDashboardSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For people"
        eyebrowTone="neutral"
        title="Your personal account"
        description="This page shows the real signed-in account. Personal minutes are not displayed until the personal billing backend is connected."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Personal plan" description="Personal billing will be wired separately from company SDK billing." />
          <PanelBody>
            <div className="flex items-center gap-2">
              <StatusPill tone="neutral" label="Not connected" />
              <strong className="text-lg text-gray-100">Personal billing</strong>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Company workspace billing, usage, and quotas are already managed on the Builders side. The People wallet needs its own persisted plan and usage records before minute counters are shown here.
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="One login, two wallets" description="The product switcher keeps billing context clear." />
          <PanelBody>
            <DisplayRow label="Signed in as">{session.email ?? "Unknown account"}</DisplayRow>
            <DisplayRow label="Personal learning">Bundled skill library connected</DisplayRow>
            <DisplayRow label="Company projects">Managed on the Builders side</DisplayRow>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
