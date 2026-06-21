import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import {
  CodeBlock,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
} from "../v2";
import { CustomerWebsitePreview, StudioAssistantPreview } from "./DashboardWidgetTest";
import { WidgetConfigForm } from "./WidgetConfigForm";

export const dynamic = "force-dynamic";

export default async function WidgetPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [keys, config, skillSelection] = await Promise.all([
    repo.listApiKeys(tenantId),
    repo.getWidgetConfig(tenantId),
    getDashboardSkillSelection(repo, tenantId),
  ]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey
    ? `${publishableKey.prefix}_...${publishableKey.last4}`
    : "pk_live_your_key";
  const launcherAttr = config.launcherLabel
    ? `\n        data-skilly-launcher="${config.launcherLabel}"`
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Widget"
        title="Preview Skilly on your website."
        description="Enter a website URL, add product context or docs, and test Skilly over the live site first. Studio falls back to a generated preview only when embedding is blocked."
      />

      <div id="customer-website-preview" className="scroll-mt-24">
        <Panel>
          <PanelHeader
            title="Live customer preview"
            description="Studio opens the actual site when possible, overlays Skilly from the parent page, and uses generated preview only as the blocked-iframe fallback."
          />
          <PanelBody>
            <CustomerWebsitePreview
              skillId={skillSelection.skillId}
              accentColor={config.accentColor}
              launcherLabel={config.launcherLabel}
            />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel>
          <PanelHeader
            title="Appearance"
            description="Accent color and language are injected into your embed snippet. The launcher label personalizes the button."
          />
          <PanelBody>
            <WidgetConfigForm
              initialAccentColor={config.accentColor}
              initialLocale={config.locale}
              initialLauncherLabel={config.launcherLabel ?? ""}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Your embed snippet" description="After the preview feels right, drop this into your site." />
          <PanelBody>
            <CodeBlock
              language="html"
              label="HTML"
              highlight={["data-skilly-key", "data-skilly-skill", "data-skilly-backend-url", "data-skilly-core-url", "data-skilly-accent", "data-skilly-locale"]}
              code={`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${displayKey}"
        data-skilly-skill="${skillSelection.skillId}"
        data-skilly-backend-url="https://studio.tryskilly.app"
        data-skilly-core-url="https://cdn.tryskilly.app/web/v1.0.0/skilly_core_web_sdk.js"
        data-skilly-accent="${config.accentColor}"
        data-skilly-locale="${config.locale}"${launcherAttr}
        defer></script>`}
            />
            {!publishableKey && (
              <p className="mt-3 text-xs text-amber-300">
                Create a publishable key in API Keys to get a real{" "}
                <code className="font-mono">data-skilly-key</code>.
              </p>
            )}
          </PanelBody>
        </Panel>
      </div>

      <details className="rounded-[16px] border border-line bg-white/[0.035]">
        <summary className="cursor-pointer px-[18px] py-[17px] text-[15px] font-bold tracking-[-0.01em] text-gray-100">
          Studio setup assistant
          <span className="ml-2 text-[13px] font-normal text-muted">
            Optional internal guide for this dashboard.
          </span>
        </summary>
        <div className="border-t border-line-soft p-[18px]">
          <StudioAssistantPreview accentColor={config.accentColor} />
        </div>
      </details>
    </div>
  );
}
