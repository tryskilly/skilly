import { getRepo } from "@/db";
import { getWorkspaceLiveness } from "@/lib/workspaceLiveness";
import { getCurrentDashboardTenantId } from "@/lib/session";
import {
  ButtonLink,
  CheckList,
  CheckRow,
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
  type ReadinessCheck,
} from "./v2";
import { HandoffDraftReview } from "./HandoffDraftReview";

export const dynamic = "force-dynamic";

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Format a second count as "1m 58s" / "42s". */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatResult(result: string | null | undefined): React.ReactNode {
  if (!result) return <StatusPill label="—" />;
  if (result === "completed") return <StatusPill tone="green" label="Completed" showDot />;
  if (result === "mic_denied") return <StatusPill tone="red" label="Mic denied" showDot />;
  if (result === "error") return <StatusPill tone="red" label="Error" showDot />;
  if (result === "quota") return <StatusPill tone="amber" label="Quota" showDot />;
  return <StatusPill label={result} />;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ handoff?: string }> }) {
  const params = await searchParams;
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [usage, liveness, metrics, recentSessions] = await Promise.all([
    repo.getUsageSummary(tenantId),
    getWorkspaceLiveness(repo, tenantId),
    repo.getUsageMetrics(tenantId),
    repo.listRecentSessions(tenantId, 5),
  ]);

  const { hasSkill, hasSurface, hasPreviewed, isInstalled, isLive } = liveness;
  const isSetUp = hasSkill && hasSurface && liveness.hasPublishableKey;
  const title = !isSetUp
    ? "Get this site configured."
    : !isInstalled
      ? "Waiting for Skilly on your site."
      : !isLive
        ? "Installed. Run your first session."
        : `Skilly is live on ${liveness.installedOrigin}.`;
  const description = !isSetUp
    ? "Write your guide, put Skilly on your site, and run your first real conversation. Styling is optional."
    : !isInstalled
      ? "Paste the install script and reload your site so Studio can confirm Skilly has loaded."
      : !isLive
        ? `Installed on ${liveness.installedOrigin}. Open your site and ask Skilly one question to go live.`
        : "Skilly has loaded on your site and a real end-user session is recorded.";
  const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
  const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;
  const nextStep = !hasSkill
    ? { label: "Draft my guide", href: "/onboarding/start" }
    : !hasPreviewed
      ? { label: "Try it on your site", href: "/dashboard/widget" }
      : { label: "Go live", href: "/dashboard/go-live" };
  const getLiveChecks: ReadinessCheck[] = [
    { id: "guide", label: "Draft the guide", status: hasSkill ? "done" : "pending", href: "/dashboard/setup" },
    { id: "preview", label: "Try it on your site", status: hasPreviewed ? "done" : "pending", href: "/dashboard/widget" },
    { id: "live", label: "Go live", status: isLive ? "done" : "pending", href: "/dashboard/go-live" },
  ];

  if (!isLive) {
    return (
      <div className="space-y-6">
        <HandoffDraftReview handoffPending={params.handoff === "1"} />
        <header className="mb-6 flex flex-wrap items-start justify-between gap-[18px]">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent-text">Get live</p>
            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.035em] text-fg">Let&apos;s get Skilly live.</h1>
            <p className="mt-[7px] max-w-[690px] text-sm leading-relaxed text-fg-muted">Draft your guide, try it on your site, then put Skilly in front of your users.</p>
          </div>
        </header>
        <Panel>
          <PanelHeader
            title="Get live"
            action={<ButtonLink href={nextStep.href} variant="primary">{nextStep.label}</ButtonLink>}
          />
          <PanelBody>
            <CheckList>
              {getLiveChecks.map((check) => <CheckRow key={check.id} check={check} />)}
            </CheckList>
          </PanelBody>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HandoffDraftReview handoffPending={params.handoff === "1"} />
      <PageHeader
        eyebrow="For builders"
        title={title}
        description={description}
        action={
          <>
            <ButtonLink href="/dashboard/go-live" variant="secondary">
              Go live
            </ButtonLink>
            <ButtonLink
              href="/dashboard/widget"
              variant="secondary"
              analyticsEvent="dashboard_widget_preview_clicked"
              analyticsLabel="Preview widget"
            >
              Test widget
            </ButtonLink>
          </>
        }
      />

      <Panel className="overflow-hidden">
        <div className="relative grid gap-[22px] p-[22px] lg:grid-cols-[1fr_320px]">
          {/* Ambient amber glow behind the preview area */}
          <div className="relative z-10">
            <StatusPill tone="green" label="Live" showDot />
            <h2 className="mt-4 max-w-[620px] text-[28px] font-extrabold leading-tight tracking-[-0.045em] text-fg">
              {title}
            </h2>
            <p className="mt-2 max-w-[690px] text-sm leading-relaxed text-fg-muted">
              {description}
            </p>
            <div className="mt-[22px] flex flex-wrap gap-2.5">
              <ButtonLink href="/dashboard/widget" variant="primary">
                Run live test
              </ButtonLink>
            </div>
          </div>

          {/* Preview window — real cursor, fake product UI skeleton */}
          <div className="relative z-10 hidden rounded-[16px] border border-line bg-surface p-3.5 shadow-overlay lg:block">
            <div className="overflow-hidden rounded-[12px] border border-line bg-surface-sunken">
              <div className="flex h-[34px] items-center gap-1.5 border-b border-line-soft px-3">
                <span className="h-2 w-2 rounded-full bg-fg-subtle/40" />
                <span className="h-2 w-2 rounded-full bg-fg-subtle/40" />
                <span className="h-2 w-2 rounded-full bg-fg-subtle/40" />
                <span className="ml-auto text-[11px] text-fg-subtle">app preview</span>
              </div>
              <div className="grid min-h-[190px] gap-2.5 p-3.5">
                <div className="h-2.5 w-[70%] rounded-full bg-surface-strong" />
                <div className="h-2.5 w-[90%] rounded-full bg-surface-strong" />
                <div className="h-2.5 w-[45%] rounded-full bg-surface-strong" />
                <div className="mt-3 rounded-[12px] border border-accent-line bg-accent-soft p-3">
                  <strong className="text-accent-text">Create project</strong>
                  <div className="mt-2.5 h-2.5 w-[70%] rounded-full bg-surface-strong" />
                </div>
              </div>
            </div>
            {/* Real cursor glyph pointing at the highlighted box */}
            <div className="absolute bottom-[78px] right-[150px] -rotate-6">
              <CursorGlyph size={34} />
            </div>
          </div>
        </div>
      </Panel>
      {/* Usage metric strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Minutes used"
          value={usedMinutes}
          foot={capMinutes > 0 ? `of ${capMinutes} this month` : "no cap applied"}
        />
        <Metric label="Sessions" value={metrics.sessionCount} foot="this month" />
        <Metric
          label="Avg session"
          value={metrics.sessionCount > 0 ? formatDuration(metrics.avgSessionSeconds) : "—"}
          foot={metrics.sessionCount > 0 ? "healthy range" : "no sessions yet"}
        />
        <Metric
          label="Error rate"
          value={metrics.sessionCount > 0 ? `${Math.round(metrics.errorRate * 100)}%` : "—"}
          tone={metrics.errorRate >= 0.1 ? "amber" : "neutral"}
          foot="this month"
        />
      </div>

      {/* Widget health + recent sessions */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Recent sessions" description="Latest user interactions with the widget." />
          <PanelBody>
            {recentSessions.length > 0 ? (
              <DataTable>
                <DataTableHeader>
                  <Th>Time</Th>
                  <Th>Domain</Th>
                  <Th>Page</Th>
                  <Th>Duration</Th>
                  <Th>Result</Th>
                </DataTableHeader>
                <DataTableBody>
                  {recentSessions.map((session, index) => (
                    <Tr key={`${session.createdAt.toISOString()}-${index}`}>
                      <Td>{formatTimestamp(session.createdAt)}</Td>
                      <Td mono>{session.domain ?? "—"}</Td>
                      <Td>{session.page ?? "—"}</Td>
                      <Td mono>{formatDuration(session.durationSeconds ?? session.seconds)}</Td>
                      <Td>{formatResult(session.result)}</Td>
                    </Tr>
                  ))}
                </DataTableBody>
              </DataTable>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CursorGlyph size={36} />
                <div className="text-sm font-bold text-fg">No sessions yet</div>
                <p className="max-w-xs text-xs text-fg-muted">
                  Install the script and start a test session to see real interactions here.
                </p>
                <ButtonLink
                  href="/dashboard/widget"
                  variant="secondary"
                  analyticsEvent="dashboard_widget_preview_clicked"
                  analyticsLabel="Preview widget"
                >
                  Preview widget
                </ButtonLink>
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Widget health" description="Operational checks from the current tenant." />
          <PanelBody className="pt-[18px]">
            <CheckList>
              <CheckRow check={{ id: "token", label: "Token endpoint", status: "done" }} trailing={<StatusPill tone="green" label="Healthy" />} />
              <CheckRow
                check={{ id: "skill", label: "Skill file", status: hasSkill ? "done" : "warning" }}
                trailing={<StatusPill tone={hasSkill ? "green" : "amber"} label={hasSkill ? "Saved" : "Empty"} />}
              />
              <CheckRow
                check={{ id: "origin", label: "Origin policy", status: hasSurface ? "done" : "warning" }}
                trailing={<StatusPill tone={hasSurface ? "green" : "amber"} label={hasSurface ? "Allowed" : "Review"} />}
              />
              <CheckRow
                check={{ id: "quota", label: "Usage quota", status: usage.capSeconds > 0 ? "done" : "warning" }}
                trailing={<StatusPill tone={usage.capSeconds > 0 ? "green" : "amber"} label={usage.capSeconds > 0 ? "Available" : "No cap"} />}
              />
            </CheckList>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
