import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import {
  ButtonLink,
  DataTable,
  DataTableBody,
  DataTableHeader,
  Metric,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
  Td,
  Th,
  Tr,
} from "../../v2";
import { CreateTenantForm } from "./CreateTenantForm";
import { TenantControls } from "./TenantControls";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  await requireDashboardSession("super_admin");
  const repo = getRepo();
  const tenants = await repo.listTenants();
  const summaries = await Promise.all(
    tenants.map(async (tenant) => {
      const [usage, metrics, keys, skillSelection, members] = await Promise.all([
        repo.getUsageSummary(tenant.id),
        repo.getUsageMetrics(tenant.id),
        repo.listApiKeys(tenant.id),
        getDashboardSkillSelection(repo, tenant.id),
        repo.listDashboardMemberships(tenant.id),
      ]);
      const hasOrigin = tenant.allowedOrigins.length > 0;
      const hasPublishableKey = keys.some((key) => key.keyType === "publishable" && !key.revoked);
      const hasSkill = Boolean(skillSelection.skill?.content.trim());
      const configured = hasOrigin && hasPublishableKey && hasSkill;
      return { tenant, usage, metrics, members, hasOrigin, hasPublishableKey, hasSkill, configured };
    }),
  );

  const totalUsageSeconds = summaries.reduce((total, summary) => total + summary.usage.usageSecondsThisPeriod, 0);
  const totalSessions = summaries.reduce((total, summary) => total + summary.metrics.sessionCount, 0);
  const activeTenants = summaries.filter((summary) => summary.metrics.sessionCount > 0).length;
  const configuredTenants = summaries.filter((summary) => summary.configured).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super admin"
        title="Workspace command center"
        description="Cross-tenant operations: customers, setup state, consumption, health, members, quota, and workspace controls."
        action={<StatusPill label={`${tenants.length} workspaces`} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Workspaces" value={tenants.length} foot={`${configuredTenants} configured`} />
        <Metric label="Active tenants" value={activeTenants} foot="with sessions this month" />
        <Metric label="Total sessions" value={totalSessions} foot="this month" />
        <Metric label="Minutes used" value={Math.round(totalUsageSeconds / 60)} foot="this month" />
      </div>

      <Panel>
        <PanelHeader
          title="Customer workspaces"
          description="Operational view across every tenant. Use Manage for members and details; use controls below for cap/name changes."
        />
        <PanelBody>
          {summaries.length > 0 ? (
            <DataTable>
              <DataTableHeader>
                <Th>Workspace</Th>
                <Th>Status</Th>
                <Th align="right">Usage</Th>
                <Th align="right">Sessions</Th>
                <Th align="right">Error</Th>
                <Th align="right">Domains</Th>
                <Th align="right">Members</Th>
                <Th>Actions</Th>
              </DataTableHeader>
              <DataTableBody>
                {summaries.map(({ tenant, usage, metrics, members, configured, hasOrigin, hasPublishableKey, hasSkill }) => {
                  const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
                  const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;
                  const errorPercent = metrics.sessionCount > 0 ? Math.round(metrics.errorRate * 100) : 0;
                  const missing = [
                    !hasOrigin ? "domain" : null,
                    !hasPublishableKey ? "key" : null,
                    !hasSkill ? "skill" : null,
                  ].filter(Boolean);

                  return (
                    <Tr key={tenant.id}>
                      <Td>
                        <div className="min-w-[220px]">
                          <div className="font-bold text-gray-100">{tenant.name}</div>
                          <div className="mt-1 max-w-[260px] truncate font-mono text-[11px] text-gray-500">{tenant.id}</div>
                        </div>
                      </Td>
                      <Td>
                        <div className="grid gap-1">
                          <StatusPill
                            tone={configured ? "green" : "amber"}
                            label={configured ? "Configured" : "Needs setup"}
                            showDot
                          />
                          {missing.length > 0 && (
                            <span className="text-[11px] text-gray-500">Missing {missing.join(", ")}</span>
                          )}
                        </div>
                      </Td>
                      <Td align="right" mono>
                        {usedMinutes}
                        {capMinutes > 0 ? ` / ${capMinutes}` : ""}
                        {" min"}
                      </Td>
                      <Td align="right" mono>{metrics.sessionCount}</Td>
                      <Td align="right">
                        <StatusPill
                          tone={errorPercent >= 10 ? "amber" : "neutral"}
                          label={metrics.sessionCount > 0 ? `${errorPercent}%` : "—"}
                        />
                      </Td>
                      <Td align="right" mono>{tenant.allowedOrigins.length}</Td>
                      <Td align="right" mono>{members.length}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <ButtonLink
                            href={`/dashboard/admin/tenants/${tenant.id}`}
                            variant="secondary"
                            analyticsEvent="dashboard_tenant_manage_clicked"
                            analyticsLabel={tenant.name}
                          >
                            Manage
                          </ButtonLink>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </DataTableBody>
            </DataTable>
          ) : (
            <p className="text-sm text-muted">No tenants exist yet. Create one below to get started.</p>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Create tenant"
          description="Onboard a new customer workspace. The monthly cap can be 0 (no paid access) or adjusted later."
        />
        <PanelBody>
          <CreateTenantForm />
        </PanelBody>
      </Panel>

      {summaries.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summaries.map(({ tenant, usage }) => {
            const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
            const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;
            const fraction = capMinutes > 0 ? Math.min(1, usedMinutes / capMinutes) : 0;
            return (
              <Panel key={tenant.id}>
                <div className="grid gap-5 p-[18px]">
                  <div>
                    <div className="text-[15px] font-bold tracking-[-0.01em] text-gray-100">{tenant.name}</div>
                    <p className="mt-1 text-xs text-muted">Quota and workspace-name controls.</p>
                  </div>
                  <TenantControls
                    tenantId={tenant.id}
                    tenantName={tenant.name}
                    capMinutes={tenant.usageCapSeconds > 0 ? Math.round(tenant.usageCapSeconds / 60) : 0}
                  />
                  <div className="border-t border-line-soft pt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Usage this month</span>
                      <span className="text-gray-200">
                        {usedMinutes}
                        {capMinutes > 0 && ` / ${capMinutes}`} min
                      </span>
                    </div>
                    {capMinutes > 0 && (
                      <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-amber-300),var(--color-amber-500))]"
                          style={{ width: `${fraction * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
