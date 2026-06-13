import type { ReactNode } from "react";
import { getRepo } from "@/db";
import { getCurrentTenantId } from "@/lib/session";
import { AnalyticsProvider } from "../AnalyticsProvider";
import { DashboardShell } from "./DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const tenantId = getCurrentTenantId();
  const tenant = await getRepo().getTenant(tenantId);
  return (
    <AnalyticsProvider tenantId={tenantId} tenantName={tenant?.name ?? "Workspace"}>
      <DashboardShell tenantName={tenant?.name ?? "Workspace"}>{children}</DashboardShell>
    </AnalyticsProvider>
  );
}
