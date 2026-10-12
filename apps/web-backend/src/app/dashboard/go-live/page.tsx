import Link from "next/link";
import { getRepo } from "@/db";
import { getBillingPlanOptions } from "@/domain/billing";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { captureServerEvent } from "@/lib/analytics";
import { getWorkspaceLiveness } from "@/lib/workspaceLiveness";
import { addOriginAction, removeOriginAction } from "../actions";
import { Button, ButtonLink, ConfirmRemoveButton, Field, Panel, PanelBody } from "../v2";
import { WidgetConfigForm } from "../widget/WidgetConfigForm";
import { GoLivePlans } from "./GoLivePlans";
import { GoLiveSnippet } from "./GoLiveSnippet";
import { StepBadge } from "./StepBadge";

export const dynamic = "force-dynamic";

function originHost(origin: string | undefined): string {
  if (!origin) return "your site";
  try { return new URL(origin).host; } catch { return origin; }
}

export default async function GoLivePage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [publishableKey, project, liveness, usage] = await Promise.all([
    repo.ensurePublishableKey(tenantId),
    repo.ensureDefaultProject(tenantId),
    getWorkspaceLiveness(repo, tenantId),
    repo.getUsageSummary(tenantId),
  ]);
  if (publishableKey.created) {
    await captureServerEvent("dashboard_publishable_key_auto_created", { tenant_id: tenantId });
  }
  const config = project.widgetConfig;

  return (
    <div className="space-y-5">
      <header className="pb-1">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent-text">Step 3 of 3 · Go live</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.035em] text-fg">Put Skilly in front of your users.</h1>
        <p className="mt-2 text-sm text-fg-muted">Three things, all on this page.</p>
      </header>

      <Panel>
        <PanelBody className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <StepBadge step={1} done={project.allowedOrigins.length > 0} />
            <h2 className="text-base font-bold text-fg">Where Skilly can run</h2>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {project.allowedOrigins.map((origin) => (
              <div key={origin} className="flex max-w-full items-center gap-2 rounded-[8px] border border-line-soft bg-surface-sunken px-3 py-1.5">
                <span className="break-all font-mono text-xs text-fg">{origin}</span>
                <div className="[&>form>span>button]:h-6 [&>form>span>button]:border-transparent [&>form>span>button]:bg-transparent [&>form>span>button]:px-1 [&>form>span>button]:text-xs [&>form>span>button]:text-fg-muted">
                  <ConfirmRemoveButton action={removeOriginAction} hiddenFieldName="origin" hiddenFieldValue={origin}
                    triggerLabel="Remove" title="Remove this origin?"
                    body={`Widget sessions from ${origin} will be rejected once it is removed.`} confirmLabel="Remove origin"
                    analyticsEvent="dashboard_origin_removed" analyticsLabel={origin} />
                </div>
              </div>
            ))}
            <details className="min-w-0 rounded-[8px] border border-dashed border-line">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-fg-muted hover:text-fg">+ Add staging or another domain</summary>
              <form action={addOriginAction} className="grid gap-3 border-t border-line-soft p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field name="origin" label="Origin" placeholder="https://app.acme.com" helper="Include the protocol." />
                <Button variant="secondary">Add domain</Button>
              </form>
            </details>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-fg-muted">Skilly refuses to start anywhere else, even if someone copies your script.</p>
            <Link href="/dashboard/origins" className="text-xs text-fg-muted underline hover:text-fg">Adding a mobile app?</Link>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelBody className="space-y-4 p-5 sm:p-6">
          <GoLiveSnippet skillId={project.skillId} widgetConfig={config} publishableKey={publishableKey.rawKey} />
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-3 ${liveness.isInstalled || liveness.isLive ? "border-success/25 bg-success-soft" : "border-line-soft bg-surface-sunken"}`}>
            <p className="flex min-w-0 items-center gap-2 text-sm text-fg">
              <span className={`h-2 w-2 shrink-0 rounded-full ${liveness.isInstalled || liveness.isLive ? "bg-success" : "bg-accent"}`} />
              {liveness.isLive ? `Skilly is live on ${liveness.installedOrigin}.`
                : liveness.isInstalled ? `Installed on ${liveness.installedOrigin}. Open your site and ask Skilly one question.`
                  : `Waiting for Skilly to load on ${originHost(project.allowedOrigins[0])}…`}
            </p>
            <ButtonLink href="/dashboard/go-live" variant="secondary" analyticsEvent="dashboard_go_live_check_again_clicked">Check again</ButtonLink>
          </div>
        </PanelBody>
      </Panel>

      <GoLivePlans capSeconds={usage.capSeconds} plans={getBillingPlanOptions(process.env)}>
        <details className="rounded-[16px] border border-line bg-surface shadow-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-fg">Customize the launcher <span className="font-normal text-fg-muted">(optional)</span></summary>
          <div className="border-t border-line-soft p-5">
            <WidgetConfigForm saveButtonVariant="secondary" initialAccentColor={config.accentColor}
              initialLocale={config.locale} initialLauncherLabel={config.launcherLabel ?? ""}
              initialActionsEnabled={config.actionsEnabled} initialGuestSessionCapSeconds={config.guestSessionCapSeconds} />
          </div>
        </details>
      </GoLivePlans>
    </div>
  );
}
