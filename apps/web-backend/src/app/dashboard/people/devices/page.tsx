import { requireDashboardSession } from "@/lib/dashboardAuth";
import { DisplayRow, PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../../v2";

export const dynamic = "force-dynamic";

export default async function PeopleDevicesPage() {
  const session = await requireDashboardSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For people"
        eyebrowTone="neutral"
        title="Device sync"
        description="Device management is not exposed as a fake list. The dashboard currently knows only the signed-in web session."
      />

      <Panel>
        <PanelHeader title="Current web session" description="Real account state from the Studio session cookie." />
        <PanelBody>
          <div className="mb-4">
            <StatusPill tone="green" label="Signed in" />
          </div>
          <DisplayRow label="Email">{session.email ?? "Unknown account"}</DisplayRow>
          <DisplayRow label="Role">{session.role === "super_admin" ? "Super admin" : "Tenant admin"}</DisplayRow>
          <DisplayRow label="Device registry">Not connected yet</DisplayRow>
        </PanelBody>
      </Panel>
    </div>
  );
}
