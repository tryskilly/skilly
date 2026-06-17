import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { KeyManager } from "../KeyManager";
import { PageHeader } from "../v2";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const keys = await getRepo().listApiKeys(await getCurrentDashboardTenantId());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="API keys"
        title="Control access to Skilly runtimes."
        description="Publishable keys identify web and mobile clients. Secret keys are reserved for trusted server-side integrations. New keys are shown once."
      />
      <KeyManager keys={keys} />
    </div>
  );
}
