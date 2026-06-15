import { getRepo } from "@/db";
import { dashboardAuthModeLabel, getDashboardSession } from "@/lib/dashboardAuth";
import { getCurrentDashboardTenantId } from "@/lib/session";
import {
  DisplayRow,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../v2";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, session] = await Promise.all([getRepo().getTenant(tenantId), getDashboardSession()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        eyebrowTone="neutral"
        title="Workspace administration."
        description="Company profile, team, and tenant identifiers. Super-admin controls live in the dedicated tenant directory."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Company profile" description="The active workspace resolved by the current session." />
          <PanelBody>
            <DisplayRow label="Name">{tenant?.name ?? "Unknown workspace"}</DisplayRow>
            <div className="border-b border-line-soft py-[13px]">
              <div className="mb-1.5 text-sm font-bold text-gray-100">Tenant ID</div>
              <code className="block break-all rounded-[10px] border border-line bg-gray-950 px-3 py-2 font-mono text-xs text-gray-300">
                {tenant?.id ?? "not available"}
              </code>
            </div>
            <DisplayRow label="Role">{session?.role === "super_admin" ? "Super admin" : "Tenant admin"}</DisplayRow>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Roles" description="Two product surfaces with separate permissions." />
          <PanelBody>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-3">
                <strong className="block text-gray-100">Tenant admin</strong>
                <span className="text-muted">Manages install code, SDK keys, allowed domains, app IDs, skills, usage, and billing.</span>
              </div>
              <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/[0.08] p-3">
                <strong className="block text-amber-200">Super admin</strong>
                <span className="text-gray-400">Audits and manages every tenant from one cross-tenant operational view.</span>
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Authentication status"
          description="Dashboard pages and mutations are protected by a signed HTTP-only session cookie. WorkOS AuthKit resolves a signed-in user to an explicit tenant membership."
        />
        <PanelBody>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="green" label={dashboardAuthModeLabel()} showDot />
            <StatusPill label={session?.role === "super_admin" ? "Super admin" : "Tenant admin"} />
            <StatusPill tone="green" label="Tenant resolver active" />
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
