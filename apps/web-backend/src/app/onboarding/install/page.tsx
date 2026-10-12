import { getRepo } from "@/db";
import { buildInstallSnippet } from "@/lib/installSnippet";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import { CodeBlock, Panel, PanelBody, PanelHeader } from "@/app/dashboard/v2";
import { OnboardingStepFooter } from "../shared";

export const dynamic = "force-dynamic";

export default async function OnboardingInstallPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys, skillSelection] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    getDashboardSkillSelection(repo, tenantId),
  ]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey ? `${publishableKey.prefix}_...${publishableKey.last4}` : "pk_live_your_key";

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-accent-text">Step 2 of 4</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-fg">Install the widget</h1>
        <p className="mt-2 max-w-xl text-sm text-fg-muted">
          Copy this snippet into your site. After your first allowed origin and publishable key are set in the dashboard,
          the widget can request Realtime tokens.
        </p>
      </div>

      <Panel className="mb-4">
        <PanelHeader title="Install script" description="Paste before the closing body tag." />
        <PanelBody>
          <CodeBlock
            language="html"
            label="HTML"
            highlight={["data-skilly-key", "data-skilly-skill"]}
            code={buildInstallSnippet({ publishableKey: displayKey, skillId: skillSelection.skillId })}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Before you go live" description="Set these in the dashboard after onboarding." />
        <PanelBody>
          <ul className="grid gap-2.5 text-sm">
            <li className="flex items-center justify-between rounded-[12px] border border-line-soft bg-surface px-3 py-2.5">
              <span className="text-fg-muted">Add an allowed origin</span>
              <span className="text-xs text-fg-muted">{tenant?.allowedOrigins.length ? "Done" : "In dashboard →"}</span>
            </li>
            <li className="flex items-center justify-between rounded-[12px] border border-line-soft bg-surface px-3 py-2.5">
              <span className="text-fg-muted">Generate a publishable key</span>
              <span className="text-xs text-fg-muted">{publishableKey ? "Done" : "In dashboard →"}</span>
            </li>
            <li className="flex items-center justify-between rounded-[12px] border border-line-soft bg-surface px-3 py-2.5">
              <span className="text-fg-muted">Save a teaching skill</span>
              <span className="text-xs text-fg-muted">Next step →</span>
            </li>
          </ul>
        </PanelBody>
      </Panel>

      <OnboardingStepFooter currentStep={2} nextHref="/onboarding/skill" />
    </>
  );
}
