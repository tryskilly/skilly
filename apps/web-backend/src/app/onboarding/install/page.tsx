import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { CodeBlock, Panel, PanelBody, PanelHeader } from "@/app/dashboard/v2";
import { OnboardingStepFooter } from "../shared";

export const dynamic = "force-dynamic";

export default async function OnboardingInstallPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys] = await Promise.all([repo.getTenant(tenantId), repo.listApiKeys(tenantId)]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey ? `${publishableKey.prefix}_...${publishableKey.last4}` : "pk_live_your_key";

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-amber-300">Step 2 of 4</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-gray-100">Install the widget</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
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
            code={`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${displayKey}"
        data-skilly-skill="acme-onboarding"
        defer></script>`}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Before you go live" description="Set these in the dashboard after onboarding." />
        <PanelBody>
          <ul className="grid gap-2.5 text-sm">
            <li className="flex items-center justify-between rounded-[12px] border border-line-soft bg-white/[0.035] px-3 py-2.5">
              <span className="text-gray-300">Add an allowed origin</span>
              <span className="text-xs text-muted">{tenant?.allowedOrigins.length ? "Done" : "In dashboard →"}</span>
            </li>
            <li className="flex items-center justify-between rounded-[12px] border border-line-soft bg-white/[0.035] px-3 py-2.5">
              <span className="text-gray-300">Generate a publishable key</span>
              <span className="text-xs text-muted">{publishableKey ? "Done" : "In dashboard →"}</span>
            </li>
            <li className="flex items-center justify-between rounded-[12px] border border-line-soft bg-white/[0.035] px-3 py-2.5">
              <span className="text-gray-300">Save a teaching skill</span>
              <span className="text-xs text-muted">Next step →</span>
            </li>
          </ul>
        </PanelBody>
      </Panel>

      <OnboardingStepFooter currentStep={2} nextHref="/onboarding/skill" />
    </>
  );
}
