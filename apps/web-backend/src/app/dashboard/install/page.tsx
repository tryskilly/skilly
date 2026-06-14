import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import { Badge, ButtonLink, Card, CodeBlock, SectionHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function InstallPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys] = await Promise.all([repo.getTenant(tenantId), repo.listApiKeys(tenantId)]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey ? `${publishableKey.prefix}_...${publishableKey.last4}` : "pk_live_your_key";

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Install</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Add Skilly to your product.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          Install the widget with a single script, then verify that your allowed origin can fetch the skill and mint Realtime tokens.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionHeader title="Embed snippet" description="Use the publishable key in your client. Keep OpenAI keys server-side only." />
          <div className="mb-4 flex flex-wrap gap-2">
            {["HTML", "React", "Next.js", "Webflow", "Shopify"].map((label, index) => (
              <span
                key={label}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  index === 0 ? "border-amber-500/30 bg-amber-500/15 text-amber-300" : "border-white/10 text-neutral-400"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          <CodeBlock>{`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${displayKey}"
        data-skilly-skill="${DEFAULT_SKILL_ID}"
        defer></script>`}</CodeBlock>
          <p className="mt-3 text-sm text-neutral-500">
            Local demo URL:{" "}
            <span className="break-all font-mono text-neutral-300">
              http://localhost:4399/demo/index.html?backend=http://localhost:4310
            </span>
          </p>
        </Card>

        <Card>
          <SectionHeader title="Connection checklist" />
          <ul className="grid gap-3 text-sm">
            <li className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <span>Allowed origin configured</span>
              <Badge tone={tenant?.allowedOrigins.length ? "green" : "amber"}>{tenant?.allowedOrigins.length ? "Ready" : "Needed"}</Badge>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <span>Publishable key available</span>
              <Badge tone={publishableKey ? "green" : "amber"}>{publishableKey ? "Ready" : "Needed"}</Badge>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <span>Backend token endpoint</span>
              <Badge tone="green">Live</Badge>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/origins" variant="secondary">Manage origins</ButtonLink>
            <ButtonLink href="/dashboard/keys">Create key</ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
