import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import {
  ButtonLink,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../../../v2";
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
  const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
  const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/tenants"
          className="text-sm text-muted transition hover:text-gray-200"
        >
          ← Tenant directory
        </Link>
      </div>
      <PageHeader
        eyebrow="Super admin"
        title={tenant.name}
        action={
          <ButtonLink href="/dashboard/billing" variant="secondary">
            Billing
          </ButtonLink>
        }
      />
      <p className="-mt-4 max-w-2xl break-all font-mono text-xs text-muted">{tenant.id}</p>

      <Panel>
        <PanelHeader
          title="Members"
          description="WorkOS identities mapped to this tenant. A user must have a membership to sign in. Removing the last super admin is blocked."
          action={<StatusPill label={`${members.length} members`} />}
        />
        <PanelBody>
          {members.length > 0 ? (
            <ul className="divide-y divide-line-soft">
              {members.map((member) => (
                <li key={member.workosUserId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-gray-200">{member.workosUserId}</span>
                      <StatusPill tone={member.role === "super_admin" ? "amber" : "neutral"} label={member.role === "super_admin" ? "Super admin" : "Tenant admin"} />
                    </div>
                    {member.email && <span className="text-xs text-muted">{member.email}</span>}
                  </div>
                  <RemoveMemberButton tenantId={tenantId} workosUserId={member.workosUserId} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
              No members yet. Add one below so someone can sign into this workspace.
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Add member" description="Map an existing WorkOS user to this tenant." />
        <PanelBody>
          <AddMemberForm tenantId={tenantId} />
          {superAdminCount === 0 && (
            <p className="mt-4 rounded-[12px] border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
              This tenant has no super admin — its members can&apos;t administer it. Add a super admin so it stays
              manageable.
            </p>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Usage this month" />
        <PanelBody>
          <div className="text-sm text-gray-300">
            <span className="font-bold text-gray-100">{usedMinutes}</span> minutes used
            {capMinutes > 0 && (
              <>
                {" "}
                of <span className="font-bold text-gray-100">{capMinutes}</span> minutes
              </>
            )}
            .
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
