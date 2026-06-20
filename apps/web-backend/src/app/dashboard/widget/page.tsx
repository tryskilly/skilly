import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import {
  CodeBlock,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../v2";
import { DashboardWidgetTest } from "./DashboardWidgetTest";
import { WidgetConfigForm } from "./WidgetConfigForm";

export const dynamic = "force-dynamic";

// The 8 embedded-widget states (spec §6) with visitor-safe copy. These are a
// static showcase on the Widget page — the real state machine lives in sdk/web.
const WIDGET_STATES = [
  { label: "Idle", copy: "Floating launcher waits bottom-right.", tone: "neutral" as const },
  { label: "Connecting", copy: "Connecting…", tone: "amber" as const },
  { label: "Listening", copy: "Listening… ask me anything.", tone: "amber" as const },
  { label: "Speaking", copy: "Here's where to start. I'll point you there.", tone: "green" as const },
  { label: "Pointing", copy: "Click here to create a project.", tone: "amber" as const },
  { label: "Error", copy: "Skilly couldn't connect. Try again in a moment.", tone: "red" as const },
  { label: "Mic denied", copy: "Microphone access is blocked. Allow mic access to talk with Skilly.", tone: "red" as const },
  { label: "Quota disabled", copy: "Skilly is temporarily unavailable.", tone: "neutral" as const },
];

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
        title="Shape the embedded companion."
        description="The web widget is a Shadow DOM surface with launcher, voice bubble, and cursor pointing. Amber is recommended — it behaves like a highlighter over product UIs. Your settings flow into the live embed snippet."
      />

      {/* Live test + state showcase */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel>
          <PanelHeader
            title="Test widget"
            description="Run the real embedded widget inside Studio before installing it on your site. It uses your current workspace, skill, and appearance settings."
          />
          <PanelBody>
            <DashboardWidgetTest
              skillId={skillSelection.skillId}
              accentColor={config.accentColor}
              launcherLabel={config.launcherLabel}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Widget states" description="The visitor-facing companion has 8 states. Visitor-safe copy only — no internal provider details leak." />
          <PanelBody className="pt-[18px]">
            <div className="grid gap-2.5">
              {WIDGET_STATES.map((state) => (
                <div key={state.label} className="rounded-[12px] border border-line-soft bg-white/[0.035] p-3">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={state.tone} label={state.label} showDot />
                  </div>
                  <p className="mt-2 text-xs text-muted">{state.copy}</p>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>

      {/* Config + snippet */}
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
          <PanelHeader title="Your embed snippet" description="Drop this into your site. It carries your publishable key and the config above." />
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
    </div>
  );
}
