import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { BillingCard } from "../BillingCard";
import { PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const usage = await getRepo().getUsageSummary(await getCurrentDashboardTenantId());
  const hasPlan = usage.capSeconds > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Manage plan and quota."
        description="Tenant caps gate Realtime token minting across web, iOS, Android, and future desktop surfaces."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <BillingCard capSeconds={usage.capSeconds} />

        <Panel>
          <PanelHeader title="Billing model" description="How Skilly meters usage and applies caps." />
          <PanelBody>
            <div className="grid gap-3 text-sm text-gray-300">
              <p>
                Skilly meters browser and app sessions as seconds. Token mint events are recorded separately with zero
                seconds.
              </p>
              <p>
                Polar subscription webhooks update the tenant usage cap. A cap of zero means no paid plan is active.
              </p>
              <p>The OpenAI provider key stays on the backend and is never exposed to widgets or SDK clients.</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusPill tone={hasPlan ? "green" : "amber"} label={hasPlan ? "Paid plan active" : "No paid plan"} showDot />
              <StatusPill label={hasPlan ? `${Math.round(usage.capSeconds / 60)} min / month` : "0 min cap"} />
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
