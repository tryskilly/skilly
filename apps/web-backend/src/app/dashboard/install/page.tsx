import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
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
import { ProjectContextPanel } from "../ProjectContextPanel";

export const dynamic = "force-dynamic";

const FRAMEWORKS = ["HTML", "React", "Next.js", "Webflow", "Shopify"];

export default async function InstallPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [keys, project] = await Promise.all([
    repo.listApiKeys(tenantId),
    repo.ensureDefaultProject(tenantId),
  ]);
  const publishableKey = keys.find((key) => key.keyType === "publishable" && !key.revoked);
  const displayKey = publishableKey ? `${publishableKey.prefix}_...${publishableKey.last4}` : "pk_live_your_key";

  const checks: ReadinessCheck[] = [
    { id: "origin", label: "Allowed surface configured", status: project.allowedOrigins.length || project.allowedAppIds.length ? "done" : "pending", href: "/dashboard/origins" },
    { id: "key", label: "Publishable key available", status: publishableKey ? "done" : "pending", href: "/dashboard/keys" },
    { id: "skill", label: "Skill file saved", status: project.skillContent.trim() ? "done" : "pending", href: "/dashboard/skill" },
    { id: "token", label: "Token endpoint reachable", status: "done" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For builders · Install"
        title="Add Skilly to this project."
        description="Install one snippet per customer surface. The snippet carries the project skill, backend, core runtime, and publishable key."
      />

      <ProjectContextPanel skillId={project.skillId} surfaces={["Snippet", "Frameworks", "Token check"]} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader
            title="Install snippet"
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
        data-skilly-skill="${project.skillId}"
        data-skilly-backend-url="https://studio.tryskilly.app"
        data-skilly-core-url="https://cdn.tryskilly.app/web/v1.0.0/skilly_core_web_sdk.js"
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
          <PanelHeader title="Project checklist" description="Everything required before this project can start sessions." />
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

      <Panel>
        <PanelHeader
          title="Action annotations"
          description="Actions are off by default and can be enabled in Widget settings when you are ready."
        />
        <PanelBody>
          <div className="divide-y divide-line-soft text-sm text-muted">
            <div className="grid gap-2 py-3 md:grid-cols-[220px_1fr] md:items-center">
              <code className="font-mono text-gray-200">data-skilly</code>
              <p className="text-xs leading-5">Marks a page element as an annotated target and pre-approved surface for safe actions.</p>
            </div>
            <div className="grid gap-2 py-3 md:grid-cols-[220px_1fr] md:items-center">
              <code className="font-mono text-gray-200">data-skilly-no-act</code>
              <p className="text-xs leading-5">Prevents Skilly from acting on that element or anything inside it.</p>
            </div>
            <div className="grid gap-2 py-3 md:grid-cols-[220px_1fr] md:items-center">
              <span className="font-bold text-gray-200">Widget settings</span>
              <p className="text-xs leading-5">Turn Actions on from Studio; unannotated or sensitive targets still ask the visitor to confirm.</p>
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
