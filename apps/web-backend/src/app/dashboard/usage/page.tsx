import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import {
  CursorGlyph,
  DataTable,
  DataTableBody,
  DataTableHeader,
  Metric,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
  Th,
  Td,
  Tr,
} from "../v2";

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

// Quota state styling (spec §5.14): neutral / amber / strong amber / red.
function quotaTone(fraction: number): "neutral" | "amber" | "red" {
  if (fraction >= 1) return "red";
  if (fraction >= 0.7) return "amber";
  return "neutral";
}

/** Format a second count as "1m 58s" / "42s". */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export default async function UsagePage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [usage, events, metrics, topPages, topDomains] = await Promise.all([
    repo.getUsageSummary(tenantId),
    repo.listUsageEvents(tenantId, EVENT_LIMIT),
    repo.getUsageMetrics(tenantId),
    repo.getTopPages(tenantId, 5),
    repo.getTopDomains(tenantId, 5),
  ]);
  const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
  const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;
  const remainingMinutes = capMinutes > 0 ? Math.max(0, capMinutes - usedMinutes) : null;
  const fraction = capMinutes > 0 ? usedMinutes / capMinutes : 0;
  const tone = quotaTone(fraction);
  const quotaState =
    fraction >= 1
      ? "Monthly cap reached — new sessions are paused."
      : fraction >= 0.9
        ? "Approaching the monthly cap."
        : fraction >= 0.7
          ? "Usage is climbing."
          : "Within healthy range.";

  return (
    <>
      <PageHeader
        eyebrow="Usage"
        title="Track voice minutes and sessions."
        description="Metering tracks monthly session seconds for tenant quota. Session events now carry page, domain, duration, and result dimensions."
      />

      {/* Metric strip */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Minutes used"
          value={usedMinutes}
          tone={tone}
          foot={capMinutes > 0 ? `of ${capMinutes} this month` : "no cap applied"}
        />
        <Metric label="Remaining" value={remainingMinutes === null ? "∞" : `${remainingMinutes} min`} foot={remainingMinutes === null ? "no cap" : "before minting blocks"} />
        <Metric label="Sessions" value={metrics.sessionCount} foot="this month" />
        <Metric label="Avg session" value={metrics.sessionCount > 0 ? formatDuration(metrics.avgSessionSeconds) : "—"} foot={metrics.errorRate > 0 ? `${Math.round(metrics.errorRate * 100)}% error` : "healthy"} />
      </div>

      {/* Quota state banner */}
      <Panel className="mb-4">
        <PanelBody>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <StatusPill tone={tone} label={fraction >= 1 ? "Cap reached" : fraction >= 0.7 ? "High usage" : "Healthy"} showDot />
                <span className="text-sm font-bold text-gray-100">{quotaState}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {capMinutes > 0
                  ? "New sessions are blocked once the cap is hit. Upgrade or wait for the next billing cycle."
                  : "No monthly cap is applied to this tenant yet."}
              </p>
            </div>
            {capMinutes > 0 && (
              <div className="h-2 w-full max-w-[280px] overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className={`h-full rounded-full ${tone === "red" ? "bg-error" : "bg-[linear-gradient(90deg,var(--color-amber-300),var(--color-amber-500))]"}`}
                  style={{ width: `${Math.min(100, fraction * 100)}%` }}
                />
              </div>
            )}
          </div>
        </PanelBody>
      </Panel>

      {/* Recent events */}
      <Panel>
        <PanelHeader title="Recent events" description={`Newest ${Math.min(EVENT_LIMIT, events.length)} metered events for this tenant.`} />
        <PanelBody>
          {events.length > 0 ? (
            <DataTable>
              <DataTableHeader>
                <Th>When</Th>
                <Th>Kind</Th>
                <Th align="right">Seconds</Th>
              </DataTableHeader>
              <DataTableBody>
                {events.map((event, index) => (
                  <Tr key={`${event.createdAt.toISOString()}-${index}`}>
                    <Td>{formatTimestamp(event.createdAt)}</Td>
                    <Td>{eventLabel(event.kind)}</Td>
                    <Td mono align="right">
                      {event.seconds}
                    </Td>
                  </Tr>
                ))}
              </DataTableBody>
            </DataTable>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CursorGlyph size={36} />
              <div className="text-sm font-bold text-gray-200">No events yet</div>
              <p className="max-w-xs text-xs text-muted">
                Events appear as soon as a widget mints a token or reports session seconds.
              </p>
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* Top pages + domains (v2 dimensions) */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Top pages" description="Most-visited pages by session count this month." />
          <PanelBody>
            {topPages.length > 0 ? (
              <ul className="divide-y divide-line-soft">
                {topPages.map((row) => (
                  <li key={row.page} className="flex items-center justify-between py-2.5">
                    <span className="truncate font-mono text-[13px] text-gray-300">{row.page}</span>
                    <StatusPill label={`${row.count}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-muted">No page data yet — recorded when the SDK reports a page.</p>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Top domains" description="Origins driving the most sessions this month." />
          <PanelBody>
            {topDomains.length > 0 ? (
              <ul className="divide-y divide-line-soft">
                {topDomains.map((row) => (
                  <li key={row.domain} className="flex items-center justify-between py-2.5">
                    <span className="truncate font-mono text-[13px] text-gray-300">{row.domain}</span>
                    <StatusPill label={`${row.count}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-muted">No domain data yet — recorded when the SDK reports a domain.</p>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
