import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { addAppIdAction, addOriginAction, removeAppIdAction, removeOriginAction } from "../actions";
import {
  Button,
  Field,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "../v2";

export const dynamic = "force-dynamic";

export default async function OriginsPage() {
  const tenant = await getRepo().getTenant(await getCurrentDashboardTenantId());

  return (
    <>
      <PageHeader
        eyebrow="Domains"
        title="Where can Skilly run?"
        description="Origins protect the web widget. Native app IDs protect future iOS and Android SDK requests. Both are enforced on every token mint."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Allowed web origins"
            description="Exact origins, or a single wildcard label like https://*.acme.com."
          />
          <PanelBody>
            {tenant?.allowedOrigins.length ? (
              <ul className="divide-y divide-line-soft">
                {tenant.allowedOrigins.map((origin) => (
                  <li key={origin} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-mono text-[13px] text-gray-300">{origin}</span>
                    <form action={removeOriginAction}>
                      <input type="hidden" name="origin" value={origin} />
                      <Button variant="danger" analyticsEvent="dashboard_origin_removed" analyticsLabel={origin}>
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
                No web origins configured yet.
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
            title="Allowed app IDs"
            description="iOS bundle IDs or Android package names. Trailing .* wildcard is supported."
          />
          <PanelBody>
            {tenant?.allowedAppIds.length ? (
              <ul className="divide-y divide-line-soft">
                {tenant.allowedAppIds.map((appId) => (
                  <li key={appId} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-mono text-[13px] text-gray-300">{appId}</span>
                    <form action={removeAppIdAction}>
                      <input type="hidden" name="appId" value={appId} />
                      <Button variant="danger" analyticsEvent="dashboard_app_id_removed" analyticsLabel={appId}>
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-line-soft bg-white/[0.035] p-4 text-sm text-muted">
                No native app IDs configured yet.
              </div>
            )}
            <form action={addAppIdAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field name="appId" label="App ID" placeholder="com.acme.app" />
              <Button variant="primary" analyticsEvent="dashboard_app_id_added" analyticsLabel="Add app ID">
                Add app ID
              </Button>
            </form>
            <div className="mt-4 flex items-center gap-2">
              <StatusPill tone="neutral" label={`${tenant?.allowedOrigins.length ?? 0} origins · ${tenant?.allowedAppIds.length ?? 0} app IDs`} />
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
