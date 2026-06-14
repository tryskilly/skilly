import type { ReactNode } from "react";
import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID } from "@/lib/session";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { AnalyticsProvider } from "../AnalyticsProvider";
import { DashboardShell } from "./DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireDashboardSession();
  const tenantId = session.tenantId;
  const repo = getRepo();
  const [tenant, keys, skill, switchableTenants] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    repo.getTenantSkill(tenantId, DEFAULT_SKILL_ID),
    // Only super_admins see the tenant switcher; load the directory for them.
    session.role === "super_admin" ? repo.listTenants() : Promise.resolve([]),
  ]);
  // "Needs setup" is only shown while the tenant is missing any of the three
  // things required to actually serve the widget: an allowed origin, an active
  // publishable key, and a non-empty teaching skill.
  const hasOrigin = Boolean(tenant?.allowedOrigins.length);
  const hasPublishableKey = keys.some((key) => key.keyType === "publishable" && !key.revoked);
  const hasSkill = Boolean(skill?.content.trim());
  const needsSetup = !(hasOrigin && hasPublishableKey && hasSkill);

  return (
    <AnalyticsProvider tenantId={tenantId} tenantName={tenant?.name ?? "Workspace"} roleSurface={session.role}>
      <DashboardShell
        tenantName={tenant?.name ?? "Workspace"}
        role={session.role}
        needsSetup={needsSetup}
        switchableTenants={switchableTenants}
        currentTenantId={tenantId}
      >
        {children}
      </DashboardShell>
    </AnalyticsProvider>
  );
}
