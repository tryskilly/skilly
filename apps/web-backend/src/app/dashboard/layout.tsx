import type { ReactNode } from "react";
import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import { AnalyticsProvider } from "../AnalyticsProvider";
import { AppShell } from "./v2";

export const dynamic = "force-dynamic";

// The 7 readiness checks (spec §4). Computed from the tenant's current state so
// the sidebar mini-panel + overview hero read the same score.
const READINESS_TOTAL = 7;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireDashboardSession();
  const tenantId = session.tenantId;
  const repo = getRepo();
  const [tenant, keys, skillSelection, switchableTenants, usage] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    getDashboardSkillSelection(repo, tenantId),
    // Only super_admins see the tenant switcher; load the directory for them.
    session.role === "super_admin" ? repo.listTenants() : Promise.resolve([]),
    repo.getUsageSummary(tenantId),
  ]);

  const hasOrigin = Boolean(tenant?.allowedOrigins.length);
  const hasPublishableKey = keys.some((key) => key.keyType === "publishable" && !key.revoked);
  const hasSkill = Boolean(skillSelection.skill?.content.trim());
  const needsSetup = !(hasOrigin && hasPublishableKey && hasSkill);

  // Readiness: 1 tenant, 2 origin, 3 publishable key, 4 install (origin+key),
  // 5 skill, 6 test session, 7 usage cap. Each is a real boolean we can compute.
  const readinessCompleted = [
    Boolean(tenant),
    hasOrigin,
    hasPublishableKey,
    hasOrigin && hasPublishableKey, // install script is usable
    hasSkill,
    false, // test session — no persisted signal yet; pending until a live test runs
    usage.capSeconds > 0,
  ].filter(Boolean).length;

  return (
    <AnalyticsProvider tenantId={tenantId} tenantName={tenant?.name ?? "Workspace"} roleSurface={session.role}>
      <AppShell
        tenantName={tenant?.name ?? "Workspace"}
        role={session.role}
        accountEmail={session.email ?? null}
        needsSetup={needsSetup}
        switchableTenants={switchableTenants}
        currentTenantId={tenantId}
        readinessCompleted={readinessCompleted}
        readinessTotal={READINESS_TOTAL}
        usedSecondsThisMonth={usage.usageSecondsThisPeriod}
        usageCapSeconds={usage.capSeconds}
      >
        {children}
      </AppShell>
    </AnalyticsProvider>
  );
}
