import { getRepo } from "@/db";
import { getCurrentTenantId } from "@/lib/session";
import { BillingCard } from "../BillingCard";
import { Badge, Card, SectionHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const usage = await getRepo().getUsageSummary(getCurrentTenantId());

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Billing</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Manage plan and quota.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          Tenant caps gate Realtime token minting across web, iOS, Android, and future desktop surfaces.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <BillingCard capSeconds={usage.capSeconds} />
        <Card>
          <SectionHeader title="Billing model" />
          <div className="grid gap-3 text-sm text-neutral-400">
            <p>Skilly meters browser and app sessions as seconds. Token mint events are recorded separately with zero seconds.</p>
            <p>Polar subscription webhooks update the tenant usage cap. A cap of zero means no paid plan is active.</p>
            <p>The OpenAI provider key stays on the backend and is never exposed to widgets or SDK clients.</p>
          </div>
        </Card>
      </div>
    </>
  );
}

