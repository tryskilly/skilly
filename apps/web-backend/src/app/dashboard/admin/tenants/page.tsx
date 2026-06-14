import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { ButtonLink, Card, PageHeader, SectionHeader, UsageMeter } from "../../ui";
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
        description="Cross-tenant operations for you as the platform owner: onboard customers, set quota, manage members, and audit usage from one surface."
        action={<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-neutral-300">{tenants.length} tenants</span>}
      />

      <Card>
        <SectionHeader
          title="Create tenant"
          description="Onboard a new customer workspace. The monthly cap can be 0 (no paid access) or adjusted later."
        />
        <CreateTenantForm />
      </Card>

      <div className="grid gap-4">
        {summaries.map(({ tenant, usage }) => (
          <Card key={tenant.id}>
            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <SectionHeader
                  title={tenant.name}
                  description="Customer workspace used by their web, desktop, iOS, and Android SDK integrations."
                />
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-neutral-500">Tenant ID</dt>
                    <dd className="mt-1 break-all rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-300">
                      {tenant.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Allowed web origins</dt>
                    <dd className="mt-1 text-neutral-200">{tenant.allowedOrigins.length}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Allowed native app IDs</dt>
                    <dd className="mt-1 text-neutral-200">{tenant.allowedAppIds.length}</dd>
                  </div>
                </dl>
                <div className="mt-5">
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

              <div className="grid gap-6 rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                <TenantControls
                  tenantId={tenant.id}
                  tenantName={tenant.name}
                  capMinutes={tenant.usageCapSeconds > 0 ? Math.round(tenant.usageCapSeconds / 60) : 0}
                />
                <div className="border-t border-white/10 pt-5">
                  <UsageMeter usedSeconds={usage.usageSecondsThisPeriod} capSeconds={usage.capSeconds} />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {summaries.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-400">
            No tenants exist yet. Create one above to get started.
          </p>
        </Card>
      )}
    </div>
  );
}
