import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { addAppIdAction, addOriginAction, removeAppIdAction, removeOriginAction } from "../actions";
import { ProjectContextPanel } from "../ProjectContextPanel";
import {
  Button,
  ConfirmRemoveButton,
  Field,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../v2";

export const dynamic = "force-dynamic";

export default async function OriginsPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const project = await repo.ensureDefaultProject(tenantId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For builders · Allow"
        title="Where is this project allowed to run?"
        description="Web projects use allowed origins. Native projects use app IDs. Both are enforced on every token mint."
      />

      <ProjectContextPanel skillId={project.skillId} surfaces={["Web origins", "Native app IDs"]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Web origins"
            description="Exact origins, or a single wildcard label like https://*.acme.com."
          />
          <PanelBody>
            {project.allowedOrigins.length ? (
              <ul className="divide-y divide-line-soft">
                {project.allowedOrigins.map((origin) => (
                  <li key={origin} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-mono text-[13px] text-gray-300">{origin}</span>
                    <ConfirmRemoveButton
                      action={removeOriginAction}
                      hiddenFieldName="origin"
                      hiddenFieldValue={origin}
                      triggerLabel="Remove"
                      title="Remove this origin?"
                      body={`Widget sessions from ${origin} will be rejected once it's removed.`}
                      confirmLabel="Remove origin"
                      analyticsEvent="dashboard_origin_removed"
                      analyticsLabel={origin}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
                No web origins configured for this project yet.
              </div>
            )}
            <form action={addOriginAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field name="origin" label="Origin" placeholder="https://app.acme.com" helper="Include the protocol. localhost is allowed." />
              <Button variant="primary" analyticsEvent="dashboard_origin_added" analyticsLabel="Add origin">
                Add origin
              </Button>
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Native app IDs"
            description="iOS bundle IDs or Android package names. Trailing .* wildcard is supported."
          />
          <PanelBody>
            {project.allowedAppIds.length ? (
              <ul className="divide-y divide-line-soft">
                {project.allowedAppIds.map((appId) => (
                  <li key={appId} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-mono text-[13px] text-gray-300">{appId}</span>
                    <ConfirmRemoveButton
                      action={removeAppIdAction}
                      hiddenFieldName="appId"
                      hiddenFieldValue={appId}
                      triggerLabel="Remove"
                      title="Remove this app ID?"
                      body={`Native SDK requests from ${appId} will be rejected once it's removed.`}
                      confirmLabel="Remove app ID"
                      analyticsEvent="dashboard_app_id_removed"
                      analyticsLabel={appId}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
                No native app IDs configured for this project yet.
              </div>
            )}
            <form action={addAppIdAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field name="appId" label="App ID" placeholder="com.acme.app" />
              <Button variant="primary" analyticsEvent="dashboard_app_id_added" analyticsLabel="Add app ID">
                Add app ID
              </Button>
            </form>
            <div className="mt-4 flex items-center gap-2">
              <StatusPill tone="neutral" label={`${project.allowedOrigins.length} origins · ${project.allowedAppIds.length} app IDs`} />
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
