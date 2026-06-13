import { getRepo } from "@/db";
import { Badge, Card, SectionHeader, UsageMeter } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
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
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="amber">Super admin</Badge>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-neutral-100">Tenant directory</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-400">
            Cross-tenant operations for you as the platform owner: audit tenant setup, quota, web origins, native app IDs,
            and usage from one surface.
          </p>
        </div>
        <Badge>{tenants.length} tenants</Badge>
      </section>

      <div className="grid gap-4">
        {summaries.map(({ tenant, usage }) => (
          <Card key={tenant.id}>
            <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
              <div>
                <SectionHeader
                  title={tenant.name}
                  description="Tenant workspace used by that customer's web, desktop, iOS, and Android SDK integrations."
                />
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-neutral-500">Tenant ID</dt>
                    <dd className="mt-1 break-all rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-300">
                      {tenant.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Monthly cap</dt>
                    <dd className="mt-1 font-bold text-neutral-100">
                      {tenant.usageCapSeconds > 0 ? `${Math.round(tenant.usageCapSeconds / 60)} minutes` : "No paid access"}
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
              </div>
              <div className="rounded-xl border border-white/10 bg-neutral-950/55 p-4">
                <UsageMeter usedSeconds={usage.usageSecondsThisPeriod} capSeconds={usage.capSeconds} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {summaries.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-400">No tenants exist yet.</p>
        </Card>
      )}
    </div>
  );
}
