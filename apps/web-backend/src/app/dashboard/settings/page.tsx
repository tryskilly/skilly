import { getRepo } from "@/db";
import { dashboardAuthModeLabel, getDashboardSession } from "@/lib/dashboardAuth";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { Badge, Card, PageHeader, SectionHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, session] = await Promise.all([getRepo().getTenant(tenantId), getDashboardSession()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control plane"
        eyebrowTone="neutral"
        title="Settings"
        description="Workspace configuration for tenant admins. Super-admin controls live in the dedicated tenant directory."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Tenant profile" description="The active workspace resolved by the current session." />
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-neutral-500">Name</dt>
              <dd className="mt-1 font-bold text-neutral-100">{tenant?.name ?? "Unknown workspace"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Tenant ID</dt>
              <dd className="mt-1 break-all rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-300">
                {tenant?.id ?? "not available"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <SectionHeader title="Roles" description="The dashboard has two product surfaces, with separate permissions." />
          <div className="space-y-3 text-sm text-neutral-300">
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <strong className="block text-neutral-100">Tenant admin</strong>
              <span className="text-neutral-500">Manages install code, SDK keys, allowed domains, app IDs, skills, usage, and billing.</span>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.08] p-3">
              <strong className="block text-amber-200">Super admin</strong>
              <span className="text-neutral-400">Audits and manages every tenant from one cross-tenant operational view.</span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Authentication status"
          description="Dashboard pages and mutations are protected by a signed HTTP-only session cookie. WorkOS AuthKit resolves a signed-in user to an explicit tenant membership."
        />
        <div className="flex flex-wrap gap-2">
          <Badge tone="green">{dashboardAuthModeLabel()}</Badge>
          <Badge>{session?.role === "super_admin" ? "Super admin" : "Tenant admin"}</Badge>
          <Badge>Tenant resolver active</Badge>
        </div>
      </Card>
    </div>
  );
}
