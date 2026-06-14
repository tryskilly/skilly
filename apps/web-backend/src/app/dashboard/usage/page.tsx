import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { Badge, Card, SectionHeader, UsageMeter } from "../ui";

export const dynamic = "force-dynamic";

const EVENT_LIMIT = 50;

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventLabel(kind: string): string {
  return kind === "token_mint" ? "Token mint" : kind === "session_seconds" ? "Session seconds" : kind;
}

export default async function UsagePage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [usage, events] = await Promise.all([
    repo.getUsageSummary(tenantId),
    repo.listUsageEvents(tenantId, EVENT_LIMIT),
  ]);
  const remainingSeconds = usage.capSeconds > 0 ? Math.max(0, usage.capSeconds - usage.usageSecondsThisPeriod) : null;

  const tokenMintCount = events.filter((event) => event.kind === "token_mint").length;
  const sessionCount = events.filter((event) => event.kind === "session_seconds").length;

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Usage</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Monitor companion minutes.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          Metering tracks monthly session seconds for tenant quota, plus raw token-mint and session events for auditing.
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

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="font-bold text-neutral-200">Token mints</h3>
          <p className="mt-1 text-3xl font-extrabold tracking-[-0.04em] text-neutral-100">{tokenMintCount}</p>
          <p className="mt-1 text-sm text-neutral-500">In the last {EVENT_LIMIT} events.</p>
        </Card>
        <Card>
          <h3 className="font-bold text-neutral-200">Session events</h3>
          <p className="mt-1 text-3xl font-extrabold tracking-[-0.04em] text-neutral-100">{sessionCount}</p>
          <p className="mt-1 text-sm text-neutral-500">Metered voice sessions in the same window.</p>
        </Card>
        <Card>
          <h3 className="font-bold text-neutral-200">Cap</h3>
          <p className="mt-1 text-3xl font-extrabold tracking-[-0.04em] text-neutral-100">
            {usage.capSeconds > 0 ? `${Math.round(usage.capSeconds / 60)} min` : "—"}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {usage.capSeconds > 0 ? "Monthly cap applied to this tenant." : "No paid cap applied."}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHeader
          title="Recent events"
          description={`Newest ${Math.min(EVENT_LIMIT, events.length)} metered events for this tenant.`}
        />
        {events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2 text-right">Seconds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {events.map((event, index) => (
                  <tr key={`${event.createdAt.toISOString()}-${index}`} className="text-neutral-300">
                    <td className="whitespace-nowrap px-3 py-2">{formatTimestamp(event.createdAt)}</td>
                    <td className="px-3 py-2">{eventLabel(event.kind)}</td>
                    <td className="px-3 py-2 text-right font-mono">{event.seconds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-neutral-500">
            No usage events recorded yet. They appear as soon as a widget mints a token or reports session seconds.
          </p>
        )}
      </Card>
    </>
  );
}
