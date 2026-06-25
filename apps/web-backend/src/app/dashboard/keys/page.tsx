import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { KeyManager } from "../KeyManager";
import { PageHeader } from "../v2";
import { ProjectContextPanel } from "../ProjectContextPanel";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [keys, project] = await Promise.all([
    repo.listApiKeys(tenantId),
    repo.ensureDefaultProject(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For builders · Keys"
        title="Control access for installed runtimes."
        description="Publishable keys identify approved web and native clients. Secret keys are reserved for trusted server-side integrations. New keys are shown once."
      />
      <ProjectContextPanel skillId={project.skillId} surfaces={["Publishable", "Secret"]} />
      <KeyManager keys={keys} />
    </div>
  );
}
