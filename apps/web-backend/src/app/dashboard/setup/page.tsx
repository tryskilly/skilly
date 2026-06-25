import Link from "next/link";
import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { addAppIdAction, addOriginAction, removeAppIdAction, removeOriginAction } from "../actions";
import { ProjectContextPanel } from "../ProjectContextPanel";
import { ConfirmRemoveButton } from "../v2";
import {
  Button,
  ButtonLink,
  CodeBlock,
  Field,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../v2";
import { SkillEditor } from "../skill/SkillEditor";
import { CustomerWebsitePreview } from "../widget/DashboardWidgetTest";
import { WidgetConfigForm } from "../widget/WidgetConfigForm";

export const dynamic = "force-dynamic";

const steps = [
  {
    id: "teach",
    title: "Teach",
    description: "What Skilly explains and points to",
  },
  {
    id: "style",
    title: "Style",
    description: "Accent, language, launcher label",
  },
  {
    id: "allow",
    title: "Allow",
    description: "Domains and app IDs",
  },
  {
    id: "install",
    title: "Install",
    description: "One snippet per surface",
  },
  {
    id: "test",
    title: "Test",
    description: "Live session, then go live",
  },
] as const;

export default async function SetupPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [keys, project] = await Promise.all([
    repo.listApiKeys(tenantId),
    repo.ensureDefaultProject(tenantId),
  ]);
  const config = project.widgetConfig;

  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey ? `${publishableKey.prefix}_...${publishableKey.last4}` : "pk_live_your_key";
  const hasSkill = Boolean(project.skillContent.trim());
  const hasSurface = Boolean(project.allowedOrigins.length || project.allowedAppIds.length);
  const completed = [
    hasSkill,
    Boolean(config.accentColor),
    hasSurface,
    Boolean(publishableKey),
    hasSkill && hasSurface && Boolean(publishableKey),
  ].filter(Boolean).length;
  const launcherAttr = config.launcherLabel ? `\n        data-skilly-launcher="${config.launcherLabel}"` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For builders · Set up"
        title="Get this project live."
        description="Five steps, in order. Keep the full project setup on one screen so the customer flow is easy to follow."
        action={<StatusPill tone={completed === steps.length ? "green" : "amber"} label={`${completed}/${steps.length} done`} />}
      />

      <ProjectContextPanel skillId={project.skillId} surfaces={["Teach", "Style", "Allow", "Install", "Test"]} />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[calc(var(--spacing-topbar)+24px)] lg:self-start">
          <div className="grid gap-2">
            {steps.map((step, index) => {
              const done =
                step.id === "teach"
                  ? hasSkill
                  : step.id === "style"
                    ? Boolean(config.accentColor)
                    : step.id === "allow"
                      ? hasSurface
                      : step.id === "install"
                        ? Boolean(publishableKey)
                        : hasSkill && hasSurface && Boolean(publishableKey);
              return (
                <Link
                  key={step.id}
                  href={`#${step.id}`}
                  className="flex items-start gap-3 rounded-[14px] border border-line bg-white/[0.035] p-3.5 transition hover:bg-white/[0.055]"
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-success/15 text-success"
                        : "border border-amber-500/50 text-amber-300"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-gray-100">{step.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{step.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </aside>

        <div className="space-y-5">
          <div id="teach" className="scroll-mt-24">
            <Panel>
              <PanelHeader
                title="Teach Skilly about this project"
                description="Plain markdown. This is the project-specific skill that ships with the selected site or app."
                action={<ButtonLink href="/dashboard/skill" variant="secondary">Full editor</ButtonLink>}
              />
              <PanelBody>
                <SkillEditor initialContent={project.skillContent} />
              </PanelBody>
            </Panel>
          </div>

          <div id="style" className="scroll-mt-24">
            <Panel>
              <PanelHeader
                title="Style the launcher"
                description="Baked into the install snippet. Change any time before or after launch."
                action={<StatusPill tone="neutral" label={config.accentColor} />}
              />
              <PanelBody>
                <WidgetConfigForm
                  initialAccentColor={config.accentColor}
                  initialLocale={config.locale}
                  initialLauncherLabel={config.launcherLabel ?? ""}
                />
              </PanelBody>
            </Panel>
          </div>

          <div id="allow" className="scroll-mt-24">
            <Panel>
              <PanelHeader
                title="Where Skilly is allowed to run"
                description="Web uses domains. Native uses app IDs. One key can serve approved surfaces."
                action={<ButtonLink href="/dashboard/origins" variant="secondary">Manage surfaces</ButtonLink>}
              />
              <PanelBody>
                <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="mb-3 text-sm font-bold text-gray-100">Web origins</div>
                  {project.allowedOrigins.length ? (
                    <ul className="divide-y divide-line-soft">
                      {project.allowedOrigins.map((origin) => (
                        <li key={origin} className="flex items-center justify-between gap-4 py-2.5">
                          <span className="font-mono text-[13px] text-gray-300">{origin}</span>
                          <ConfirmRemoveButton
                            action={removeOriginAction}
                            hiddenFieldName="origin"
                            hiddenFieldValue={origin}
                            triggerLabel="Remove"
                            title="Remove this origin?"
                            body={`Widget sessions from ${origin} will be rejected once it is removed.`}
                            confirmLabel="Remove origin"
                            analyticsEvent="dashboard_origin_removed"
                            analyticsLabel={origin}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
                      No web origins configured yet.
                    </div>
                  )}
                  <form action={addOriginAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field name="origin" label="Origin" placeholder="https://app.acme.com" helper="Include the protocol." />
                    <Button variant="primary">Add domain</Button>
                  </form>
                </div>

                <div>
                  <div className="mb-3 text-sm font-bold text-gray-100">Native app IDs</div>
                  {project.allowedAppIds.length ? (
                    <ul className="divide-y divide-line-soft">
                      {project.allowedAppIds.map((appId) => (
                        <li key={appId} className="flex items-center justify-between gap-4 py-2.5">
                          <span className="font-mono text-[13px] text-gray-300">{appId}</span>
                          <ConfirmRemoveButton
                            action={removeAppIdAction}
                            hiddenFieldName="appId"
                            hiddenFieldValue={appId}
                            triggerLabel="Remove"
                            title="Remove this app ID?"
                            body={`Native SDK requests from ${appId} will be rejected once it is removed.`}
                            confirmLabel="Remove app ID"
                            analyticsEvent="dashboard_app_id_removed"
                            analyticsLabel={appId}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
                      No native app IDs configured yet.
                    </div>
                  )}
                  <form action={addAppIdAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field name="appId" label="App ID" placeholder="com.acme.app" />
                    <Button variant="primary">Add app ID</Button>
                  </form>
                </div>
                </div>
              </PanelBody>
            </Panel>
          </div>

          <div id="install" className="scroll-mt-24">
            <Panel>
              <PanelHeader
                title="Add Skilly to your site"
                description="Paste before the closing body tag. The publishable key is safe in the browser."
                action={<ButtonLink href="/dashboard/keys" variant="secondary">API keys</ButtonLink>}
              />
              <PanelBody>
                <CodeBlock
                  language="html"
                  label="HTML"
                  highlight={["data-skilly-key", "data-skilly-skill", "data-skilly-backend-url", "data-skilly-core-url", "data-skilly-accent", "data-skilly-locale"]}
                  code={`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${displayKey}"
        data-skilly-skill="${project.skillId}"
        data-skilly-backend-url="https://studio.tryskilly.app"
        data-skilly-core-url="https://cdn.tryskilly.app/web/v1.0.0/skilly_core_web_sdk.js"
        data-skilly-accent="${config.accentColor}"
        data-skilly-locale="${config.locale}"${launcherAttr}
        defer></script>`}
                />
              </PanelBody>
            </Panel>
          </div>

          <div id="test" className="scroll-mt-24">
            <Panel>
              <PanelHeader
                title="Test, then go live"
                description="Run a real voice session before turning it on for visitors."
                action={<ButtonLink href="/dashboard/widget#customer-website-preview" variant="secondary">Full preview</ButtonLink>}
              />
              <PanelBody>
                <CustomerWebsitePreview
                  skillId={project.skillId}
                  accentColor={config.accentColor}
                  launcherLabel={config.launcherLabel}
                />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
