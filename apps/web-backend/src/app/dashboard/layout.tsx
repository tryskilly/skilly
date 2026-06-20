import type { ReactNode } from "react";
import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import { AnalyticsProvider } from "../AnalyticsProvider";
import { AppShell } from "./v2";

export const dynamic = "force-dynamic";

// Shell readiness is intentionally limited to persisted setup facts. The full
// overview can still recommend a live test, but the shell should not look stuck
// in setup just because there is no separate "test completed" marker yet.
const READINESS_TOTAL = 6;

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
  // 5 skill, 6 usage cap. Each is a persisted fact we can compute.
  const readinessCompleted = [
    Boolean(tenant),
    hasOrigin,
    hasPublishableKey,
    hasOrigin && hasPublishableKey, // install script is usable
    hasSkill,
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
