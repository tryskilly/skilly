import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import {
  ButtonLink,
  CheckList,
  CheckRow,
  CursorGlyph,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
  type ReadinessCheck,
} from "@/app/dashboard/v2";

export const dynamic = "force-dynamic";

export default async function OnboardingTestPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys, skillSelection] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    getDashboardSkillSelection(repo, tenantId),
  ]);
  const hasOrigin = Boolean(tenant?.allowedOrigins.length);
  const hasPublishableKey = keys.some((key) => key.keyType === "publishable" && !key.revoked);
  const hasSkill = Boolean(skillSelection.skill?.content.trim());

  const checks: ReadinessCheck[] = [
    { id: "workspace", label: "Workspace created", status: tenant ? "done" : "pending" },
    { id: "origin", label: "Allowed origin added", status: hasOrigin ? "done" : "warning", href: "/dashboard/origins" },
    { id: "key", label: "Publishable key generated", status: hasPublishableKey ? "done" : "warning", href: "/dashboard/keys" },
    { id: "skill", label: "Teaching skill saved", status: hasSkill ? "done" : "warning", href: "/dashboard/skill" },
  ];
  const ready = checks.every((check) => check.status === "done");

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-amber-300">Step 4 of 4</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-gray-100">Test before going live</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Confirm the setup is complete, then run a live test session from the widget page. You can finish remaining
          items from the dashboard at any time.
        </p>
      </div>

      <Panel className="mb-4">
        <PanelHeader
          title="Setup checklist"
          description="Everything required before the widget can serve a session."
          action={<StatusPill tone={ready ? "green" : "amber"} label={ready ? "Ready" : "Almost there"} showDot />}
        />
        <PanelBody className="pt-[18px]">
          <CheckList>
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </CheckList>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelBody>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CursorGlyph size={48} />
            <h2 className="text-lg font-bold text-gray-100">
              {ready ? "Skilly is ready to go live." : "Finish setup in the dashboard."}
            </h2>
            <p className="max-w-sm text-sm text-muted">
              {ready
                ? "Run a live test session, then enable the widget for production traffic."
                : "A few items remain. You can complete them from the dashboard whenever you're ready."}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <ButtonLink href="/dashboard/widget" variant="primary" analyticsEvent="onboarding_test_widget" analyticsLabel="Test widget">
                Test widget
              </ButtonLink>
              <ButtonLink href="/dashboard" variant="secondary" analyticsEvent="onboarding_complete" analyticsLabel="Open dashboard">
                Open dashboard
              </ButtonLink>
            </div>
          </div>
        </PanelBody>
      </Panel>
    </>
  );
}
