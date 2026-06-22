import type { Project, WebBackendRepo } from "@/db/repo";
import { getCurrentDashboardTenantId } from "./session";

export interface DashboardProjectSelection {
  tenantId: string;
  project: Project;
}

export async function getDashboardProjectSelection(repo: WebBackendRepo): Promise<DashboardProjectSelection> {
  const tenantId = await getCurrentDashboardTenantId();
  const project = await repo.ensureDefaultProject(tenantId);
  return { tenantId, project };
}
