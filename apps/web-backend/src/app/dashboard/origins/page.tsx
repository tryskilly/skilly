import { getRepo } from "@/db";
import { getCurrentTenantId } from "@/lib/session";
import { addAppIdAction, addOriginAction, removeAppIdAction, removeOriginAction } from "../actions";
import { Badge, Card, Field, FormButton, SectionHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function OriginsPage() {
  const tenant = await getRepo().getTenant(getCurrentTenantId());

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Domains</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Define where Skilly is allowed to run.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          Origins protect the web widget. Native app IDs protect future iOS and Android SDK requests.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Allowed web origins" description="Supports exact origins and a single wildcard label like https://*.acme.com." />
          {tenant?.allowedOrigins.length ? (
            <ul className="divide-y divide-white/10">
              {tenant.allowedOrigins.map((origin) => (
                <li key={origin} className="flex items-center justify-between gap-4 py-3">
                  <span className="font-mono text-sm text-neutral-300">{origin}</span>
                  <form action={removeOriginAction}>
                    <input type="hidden" name="origin" value={origin} />
                    <FormButton variant="danger">Remove</FormButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-neutral-500">
              No web origins configured yet.
            </p>
          )}
          <form action={addOriginAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field name="origin" label="Origin" placeholder="https://app.acme.com" />
            <FormButton>Add origin</FormButton>
          </form>
        </Card>

        <Card>
          <SectionHeader title="Allowed app IDs" description="Use iOS bundle IDs or Android package names. Trailing .* wildcard is supported." />
          {tenant?.allowedAppIds.length ? (
            <ul className="divide-y divide-white/10">
              {tenant.allowedAppIds.map((appId) => (
                <li key={appId} className="flex items-center justify-between gap-4 py-3">
                  <span className="font-mono text-sm text-neutral-300">{appId}</span>
                  <form action={removeAppIdAction}>
                    <input type="hidden" name="appId" value={appId} />
                    <FormButton variant="danger">Remove</FormButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-neutral-500">
              No native app IDs configured yet.
            </p>
          )}
          <form action={addAppIdAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field name="appId" label="App ID" placeholder="com.acme.app" />
            <FormButton>Add app ID</FormButton>
          </form>
        </Card>
      </div>
    </>
  );
}

