import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { Badge, ButtonLink, Card, SectionHeader } from "../../../ui";
import { AddMemberForm, RemoveMemberButton } from "./MemberForms";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requireDashboardSession("super_admin");
  const { tenantId } = await params;
  const repo = getRepo();
  const [tenant, members, usage] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listDashboardMemberships(tenantId),
    repo.getUsageSummary(tenantId),
  ]);
  if (!tenant) {
    notFound();
  }

  const superAdminCount = members.filter((member) => member.role === "super_admin").length;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/dashboard/admin/tenants"
            className="text-sm text-neutral-500 transition hover:text-neutral-300"
          >
            ← Tenant directory
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Badge tone="amber">Super admin</Badge>
            <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-neutral-100">{tenant.name}</h1>
          </div>
          <p className="mt-2 max-w-2xl break-all font-mono text-xs text-neutral-500">{tenant.id}</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/dashboard/billing" variant="secondary">
            Billing
          </ButtonLink>
        </div>
      </section>

      <Card>
        <SectionHeader
          title="Members"
          description="WorkOS identities mapped to this tenant. A user must have a membership to sign in. Removing the last super admin is blocked."
          action={<Badge>{members.length} members</Badge>}
        />
        {members.length > 0 ? (
          <ul className="divide-y divide-white/10">
            {members.map((member) => (
              <li key={member.workosUserId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-neutral-200">{member.workosUserId}</span>
                    <Badge tone={member.role === "super_admin" ? "amber" : "neutral"}>
                      {member.role === "super_admin" ? "Super admin" : "Tenant admin"}
                    </Badge>
                  </div>
                  {member.email && <span className="text-xs text-neutral-500">{member.email}</span>}
                </div>
                <RemoveMemberButton tenantId={tenantId} workosUserId={member.workosUserId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-neutral-500">
            No members yet. Add one below so someone can sign into this workspace.
          </p>
        )}
      </Card>

      <Card>
        <SectionHeader title="Add member" description="Map an existing WorkOS user to this tenant." />
        <AddMemberForm tenantId={tenantId} />
        {superAdminCount === 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
            This tenant has no super admin — its members can&apos;t administer it. Add a super admin so it stays
            manageable.
          </p>
        )}
      </Card>

      <Card>
        <SectionHeader title="Usage this month" />
        <div className="text-sm text-neutral-400">
          <span className="font-bold text-neutral-100">
            {Math.round(usage.usageSecondsThisPeriod / 60)}
          </span>{" "}
          minutes used
          {usage.capSeconds > 0 && (
            <>
              {" "}
              of <span className="font-bold text-neutral-100">{Math.round(usage.capSeconds / 60)}</span> minutes
            </>
          )}
          .
        </div>
      </Card>
    </div>
  );
}
