import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const tenantId = await getCurrentDashboardTenantId();
  const repo = getRepo();
  const [keys, project, usage] = await Promise.all([
    repo.listApiKeys(tenantId),
    repo.ensureDefaultProject(tenantId),
    repo.getUsageSummary(tenantId),
  ]);

  const checks = [
    { label: "Dashboard session", ok: true, detail: "Signed session accepted" },
    { label: "Project model", ok: Boolean(project.id), detail: project.skillId },
    { label: "Allowed surfaces", ok: Boolean(project.allowedOrigins.length || project.allowedAppIds.length), detail: `${project.allowedOrigins.length} origins · ${project.allowedAppIds.length} app IDs` },
    { label: "Publishable key", ok: keys.some((key) => key.keyType === "publishable" && !key.revoked), detail: `${keys.filter((key) => !key.revoked).length} active keys` },
    { label: "Usage cap", ok: usage.capSeconds > 0, detail: usage.capSeconds > 0 ? `${Math.round(usage.capSeconds / 60)} min / month` : "No paid cap" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        eyebrowTone="neutral"
        title="Workspace status."
        description="Live checks from the current Studio session and project configuration."
      />

      <Panel>
        <PanelHeader title="Current checks" description="Configuration and runtime prerequisites for this workspace." />
        <PanelBody>
          <div className="grid gap-3">
            {checks.map((check) => (
              <div key={check.label} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line-soft bg-white/[0.035] p-3">
                <div>
                  <div className="font-bold text-gray-100">{check.label}</div>
                  <div className="mt-1 text-xs text-muted">{check.detail}</div>
                </div>
                <StatusPill tone={check.ok ? "green" : "amber"} label={check.ok ? "Ready" : "Needs attention"} showDot />
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
