import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import {
  CodeBlock,
  CursorGlyph,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../v2";
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

/** Convert a #rrggbb accent into an rgba() with the given alpha (safe for box-shadow). */
function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    return `rgba(245, 158, 11, ${alpha})`;
  }
  const value = match[1]!;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default async function WidgetPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [keys, config] = await Promise.all([
    repo.listApiKeys(tenantId),
    repo.getWidgetConfig(tenantId),
  ]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey
    ? `${publishableKey.prefix}_...${publishableKey.last4}`
    : "pk_live_your_key";
  const launcherAttr = config.launcherLabel
    ? `\n        data-skilly-launcher="${config.launcherLabel}"`
    : "";
  const accentGlow = hexToRgba(config.accentColor, 0.14);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Widget"
        title="Shape the embedded companion."
        description="The web widget is a Shadow DOM surface with launcher, voice bubble, and cursor pointing. Amber is recommended — it behaves like a highlighter over product UIs. Your settings flow into the live embed snippet."
      />

      {/* Live preview + state showcase */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel>
          <PanelHeader title="Live preview" description="The launcher uses your configured accent color. Same cursor family as the macOS app." />
          <PanelBody>
            <div className="relative min-h-[420px] overflow-hidden rounded-[16px] border border-line bg-[linear-gradient(180deg,#242426,#151516)] p-5">
              {/* Fake product UI */}
              <div className="min-h-[360px] rounded-[12px] bg-[#f7f4ec] p-5 text-gray-900">
                <div className="mb-5 flex items-center justify-between border-b border-[#e2ded4] pb-3">
                  <strong>Acme App</strong>
                  <span className="rounded-[8px] bg-neutral-900 px-3 py-2 text-sm text-white">Create project</span>
                </div>
                <div className="w-full max-w-md rounded-[12px] border border-[#e2ded4] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                  <h3 className="text-lg font-bold">Project setup</h3>
                  <p className="mt-2 text-sm text-neutral-600">
                    Skilly can guide users through this flow and point at the next action.
                  </p>
                  <span className="mt-4 inline-block rounded-[8px] bg-neutral-900 px-3 py-2 text-sm text-white">
                    Start setup
                  </span>
                </div>
              </div>
              {/* Response bubble */}
              <div className="absolute bottom-[92px] right-6 w-80 rounded-[16px] border border-white/15 bg-gray-900 p-4 text-sm text-gray-200 shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
                I can help your users set up their first project and show them where to click.
              </div>
              {/* Real cursor launcher using the configured accent */}
              <div
                className="absolute bottom-6 right-6 grid h-14 w-14 place-items-center rounded-full text-gray-950"
                style={{
                  backgroundColor: config.accentColor,
                  boxShadow: `0 0 0 8px ${accentGlow}, 0 16px 34px rgba(0,0,0,0.28)`,
                }}
              >
                <CursorGlyph size={28} />
              </div>
            </div>
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
              highlight={["data-skilly-key", "data-skilly-skill", "data-skilly-accent", "data-skilly-locale"]}
              code={`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${displayKey}"
        data-skilly-skill="${DEFAULT_SKILL_ID}"
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
