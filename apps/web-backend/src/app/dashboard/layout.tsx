import type { ReactNode } from "react";
import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { AnalyticsProvider } from "../AnalyticsProvider";
import { DashboardShell } from "./DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireDashboardSession();
  const tenantId = session.tenantId;
  const tenant = await getRepo().getTenant(tenantId);
  return (
    <AnalyticsProvider tenantId={tenantId} tenantName={tenant?.name ?? "Workspace"} roleSurface={session.role}>
      <DashboardShell tenantName={tenant?.name ?? "Workspace"} role={session.role}>
        {children}
      </DashboardShell>
    </AnalyticsProvider>
  );
}
