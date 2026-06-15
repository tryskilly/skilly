import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { ButtonLink, PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../../v2";
import { CreateTenantForm } from "./CreateTenantForm";
import { TenantControls } from "./TenantControls";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  await requireDashboardSession("super_admin");
  const repo = getRepo();
  const tenants = await repo.listTenants();
  const summaries = await Promise.all(
    tenants.map(async (tenant) => ({
      tenant,
      usage: await repo.getUsageSummary(tenant.id),
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super admin"
        title="Tenant directory"
        description="Cross-tenant operations: onboard customers, set quota, manage members, and audit usage from one surface."
        action={<StatusPill label={`${tenants.length} tenants`} />}
      />

      <Panel>
        <PanelHeader
          title="Create tenant"
          description="Onboard a new customer workspace. The monthly cap can be 0 (no paid access) or adjusted later."
        />
        <PanelBody>
          <CreateTenantForm />
        </PanelBody>
      </Panel>

      <div className="grid gap-4">
        {summaries.map(({ tenant, usage }) => {
          const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
          const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;
          const fraction = capMinutes > 0 ? Math.min(1, usedMinutes / capMinutes) : 0;
          return (
            <Panel key={tenant.id}>
              <div className="grid gap-6 p-[18px] lg:grid-cols-2">
                <div>
                  <div className="text-[15px] font-bold tracking-[-0.01em] text-gray-100">{tenant.name}</div>
                  <p className="mt-1 text-xs text-muted">
                    Customer workspace used by their web, desktop, iOS, and Android SDK integrations.
                  </p>
                  <div className="mt-3 grid gap-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">Tenant ID</span>
                      <code className="break-all rounded-[8px] border border-line bg-gray-950 px-2.5 py-1 font-mono text-xs text-gray-300">
                        {tenant.id}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Web origins</span>
                      <span className="text-gray-200">{tenant.allowedOrigins.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Native app IDs</span>
                      <span className="text-gray-200">{tenant.allowedAppIds.length}</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ButtonLink
                      href={`/dashboard/admin/tenants/${tenant.id}`}
                      variant="secondary"
                      analyticsEvent="dashboard_tenant_manage_clicked"
                      analyticsLabel={tenant.name}
                    >
                      Manage members →
                    </ButtonLink>
                  </div>
                </div>

                <div className="grid gap-5 rounded-[14px] border border-line bg-gray-950/40 p-4">
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
              </div>
            </Panel>
          );
        })}
      </div>

      {summaries.length === 0 && (
        <Panel>
          <PanelBody>
            <p className="text-sm text-muted">No tenants exist yet. Create one above to get started.</p>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
