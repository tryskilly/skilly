import { getRepo } from "@/db";
import { getCurrentTenantId } from "@/lib/session";
import { Badge, Card, SectionHeader, UsageMeter } from "../ui";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const usage = await getRepo().getUsageSummary(getCurrentTenantId());
  const remainingSeconds = usage.capSeconds > 0 ? Math.max(0, usage.capSeconds - usage.usageSecondsThisPeriod) : null;

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Usage</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Monitor companion minutes.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          Current metering tracks monthly session seconds for tenant quota. More breakdowns can be added from usage events.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeader title="Monthly usage" />
          <UsageMeter usedSeconds={usage.usageSecondsThisPeriod} capSeconds={usage.capSeconds} />
        </Card>
        <Card>
          <SectionHeader title="Remaining" />
          <div className="text-3xl font-extrabold tracking-[-0.04em]">
            {remainingSeconds === null ? "Unlimited" : `${Math.round(remainingSeconds / 60)} min`}
          </div>
          <p className="mt-2 text-sm text-neutral-500">
            {remainingSeconds === null ? "No monthly cap is currently applied." : "Available before token minting is blocked."}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHeader title="Planned breakdowns" description="These are not wired yet, but the page is ready for richer metering." />
        <div className="grid gap-3 md:grid-cols-3">
          {["Sessions by origin", "Top pages", "Realtime errors"].map((label) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <h3 className="font-bold text-neutral-200">{label}</h3>
              <p className="mt-1 text-sm text-neutral-500">Pending usage-event dimensions.</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

