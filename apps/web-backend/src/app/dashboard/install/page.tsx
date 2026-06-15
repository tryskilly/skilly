import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import {
  ButtonLink,
  CheckList,
  CheckRow,
  CodeBlock,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
  type ReadinessCheck,
} from "../v2";

export const dynamic = "force-dynamic";

const FRAMEWORKS = ["HTML", "React", "Next.js", "Webflow", "Shopify"];

export default async function InstallPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys, skill] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    repo.getTenantSkill(tenantId, DEFAULT_SKILL_ID),
  ]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey ? `${publishableKey.prefix}_...${publishableKey.last4}` : "pk_live_your_key";

  const checks: ReadinessCheck[] = [
    { id: "origin", label: "Allowed origin configured", status: tenant?.allowedOrigins.length ? "done" : "pending", href: "/dashboard/origins" },
    { id: "key", label: "Publishable key available", status: publishableKey ? "done" : "pending", href: "/dashboard/keys" },
    { id: "skill", label: "Skill file saved", status: skill?.content.trim() ? "done" : "pending", href: "/dashboard/skill" },
    { id: "token", label: "Token endpoint reachable", status: "done" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Install"
        title="Add Skilly to your product."
        description="Copy the widget script, choose a framework guide, and verify the widget can request a token from your allowed origins."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader
            title="Install script"
            description="Paste before the closing body tag, or load through your framework. The publishable key is safe in the browser."
          />
          <PanelBody>
            <div className="mb-4 flex flex-wrap gap-2">
              {FRAMEWORKS.map((label, index) => (
                <span
                  key={label}
                  className={`inline-flex h-8 items-center rounded-full border px-2.5 text-xs font-bold ${
                    index === 0
                      ? "border-amber-500 bg-amber-500 text-gray-950"
                      : "border-line bg-white/[0.035] text-gray-400"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <CodeBlock
              language="html"
              label="HTML"
              highlight={["data-skilly-key", "data-skilly-skill"]}
              code={`<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${displayKey}"
        data-skilly-skill="${DEFAULT_SKILL_ID}"
        defer></script>`}
            />
            <p className="mt-4 text-xs text-muted">
              Local demo URL:{" "}
              <span className="break-all font-mono text-gray-300">
                http://localhost:4399/demo/index.html?backend=http://localhost:4310
              </span>
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Connection checklist" description="Everything required before the widget can start sessions." />
          <PanelBody className="pt-[18px]">
            <CheckList>
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </CheckList>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink href="/dashboard/origins" variant="secondary">
                Manage origins
              </ButtonLink>
              <ButtonLink href="/dashboard/keys" variant="secondary">
                Create key
              </ButtonLink>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted">
              <StatusPill tone="green" label="Token endpoint live" showDot />
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
