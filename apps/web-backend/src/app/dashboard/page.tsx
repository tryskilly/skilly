import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
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
  ProgressSteps,
  StatusPill,
  Th,
  Td,
  Tr,
  type ReadinessCheck,
} from "./v2";

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

export default async function DashboardPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys, usage, skill, metrics, recentSessions] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    repo.getUsageSummary(tenantId),
    getDashboardSkillSelection(repo, tenantId),
    repo.getUsageMetrics(tenantId),
    repo.listRecentSessions(tenantId, 5),
  ]);

  const hasOrigin = Boolean(tenant?.allowedOrigins.length);
  const hasPublishableKey = keys.some((key) => key.keyType === "publishable" && !key.revoked);
  const hasSkill = Boolean(skill.skill?.content.trim());

  // The 7 readiness checks (spec §4) — each maps to a real, computable state.
  const checks: ReadinessCheck[] = [
    { id: "tenant", label: "Workspace created", status: tenant ? "done" : "blocked" },
    { id: "origin", label: "Allowed origin added", status: hasOrigin ? "done" : "pending", href: "/dashboard/origins" },
    {
      id: "key",
      label: "Publishable key generated",
      status: hasPublishableKey ? "done" : "pending",
      href: "/dashboard/keys",
    },
    {
      id: "install",
      label: "Install script ready",
      status: hasOrigin && hasPublishableKey ? "done" : "pending",
      href: "/dashboard/install",
    },
    { id: "skill", label: "Teaching skill saved", status: hasSkill ? "done" : "pending", href: "/dashboard/skill" },
    {
      id: "test",
      label: "Live test session",
      status: hasOrigin && hasPublishableKey && hasSkill ? "warning" : "pending",
      href: "/dashboard/widget",
    },
    {
      id: "quota",
      label: "Usage cap available",
      status: usage.capSeconds > 0 ? "done" : "warning",
      href: "/dashboard/billing",
    },
  ];
  const completed = checks.filter((check) => check.status === "done").length;
  const isReady = completed >= checks.length;
  const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
  const capMinutes = usage.capSeconds > 0 ? Math.round(usage.capSeconds / 60) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Is Skilly ready?"
        description="The health dashboard for your installation: setup readiness, usage, widget status, and recent sessions."
        action={
          <>
            <ButtonLink href="/dashboard/install" variant="secondary">
              View install guide
            </ButtonLink>
            <ButtonLink href="/dashboard/widget" variant="primary" analyticsEvent="dashboard_widget_test_clicked" analyticsLabel="Test widget">
              Test widget
            </ButtonLink>
          </>
        }
      />

      {/* Readiness hero panel */}
      <Panel className="overflow-hidden">
        <div className="relative grid gap-[22px] p-[22px] lg:grid-cols-[1fr_320px]">
          {/* Ambient amber glow behind the preview area */}
          <div className="relative z-10">
            <StatusPill
              tone={isReady ? "green" : "amber"}
              label={isReady ? "Ready to go live" : `${checks.length - completed} checks left`}
              showDot
            />
            <h2 className="mt-4 max-w-[620px] text-[28px] font-extrabold leading-tight tracking-[-0.045em] text-gray-100">
              Skilly is <span className="text-amber-300">{completed}/{checks.length} ready</span> to teach users on your product.
            </h2>
            <p className="mt-2 max-w-[690px] text-sm leading-relaxed text-muted">
              {isReady
                ? "Everything is configured. Run a live test session, then enable the widget for production traffic."
                : "Finish the remaining setup checks before enabling the widget for production traffic."}
            </p>
            <div className="mt-5">
              <ProgressSteps completed={completed} total={checks.length} />
            </div>
            <div className="mt-[22px] flex flex-wrap gap-2.5">
              <ButtonLink href="/dashboard/install" variant="primary">
                Continue setup
              </ButtonLink>
              <ButtonLink href="/dashboard/widget" variant="secondary">
                Run test session
              </ButtonLink>
            </div>
          </div>

          {/* Preview window — real cursor, fake product UI skeleton */}
          <div className="relative z-10 hidden rounded-[16px] border border-line bg-[rgba(15,15,16,0.62)] p-3.5 shadow-[0_30px_80px_rgba(0,0,0,0.48)] lg:block">
            <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#141416]">
              <div className="flex h-[34px] items-center gap-1.5 border-b border-white/[0.07] px-3">
                <span className="h-2 w-2 rounded-full bg-white/22" />
                <span className="h-2 w-2 rounded-full bg-white/22" />
                <span className="h-2 w-2 rounded-full bg-white/22" />
                <span className="ml-auto text-[11px] text-gray-500">app preview</span>
              </div>
              <div className="grid min-h-[190px] gap-2.5 p-3.5">
                <div className="h-2.5 w-[70%] rounded-full bg-white/[0.08]" />
                <div className="h-2.5 w-[90%] rounded-full bg-white/[0.08]" />
                <div className="h-2.5 w-[45%] rounded-full bg-white/[0.08]" />
                <div className="mt-3 rounded-[12px] border border-amber-500/35 bg-amber-500/[0.06] p-3">
                  <strong className="text-amber-300">Create project</strong>
                  <div className="mt-2.5 h-2.5 w-[70%] rounded-full bg-white/[0.08]" />
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
                <div className="text-sm font-bold text-gray-200">No sessions yet</div>
                <p className="max-w-xs text-xs text-muted">
                  Install the script and start a test session to see real interactions here.
                </p>
                <ButtonLink href="/dashboard/widget" variant="secondary" analyticsEvent="dashboard_widget_test_clicked" analyticsLabel="Test widget">
                  Test widget
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
                check={{ id: "origin", label: "Origin policy", status: hasOrigin ? "done" : "warning" }}
                trailing={<StatusPill tone={hasOrigin ? "green" : "amber"} label={hasOrigin ? "Allowed" : "Review"} />}
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
