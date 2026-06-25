import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { ButtonLink, DataTable, DataTableBody, DataTableHeader, PageHeader, Panel, PanelBody, PanelHeader, StatusPill, Td, Th, Tr } from "../v2";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, projects, usage] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listProjects(tenantId),
    repo.getUsageSummary(tenantId),
  ]);

  const usedMinutes = Math.round(usage.usageSecondsThisPeriod / 60);
  const capMinutes = Math.round(usage.capSeconds / 60);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="For builders"
        title="Your sites and apps"
        description="Each customer surface should own its teaching skill, allowed domains or app IDs, launcher style, install key, usage, and setup state."
        action={<ButtonLink href="/dashboard/setup" variant="primary">Open setup</ButtonLink>}
      />

      <Panel>
        <PanelBody>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted">Plan minutes shared by this builder workspace</div>
              <div className="mt-1 text-3xl font-extrabold tracking-[-0.045em] text-gray-100">
                {usedMinutes} <span className="text-sm font-normal text-muted">of {capMinutes || 0} min used</span>
              </div>
            </div>
            <ButtonLink href="/dashboard/billing" variant="secondary">Manage plan</ButtonLink>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title={tenant?.name ? `${tenant.name} projects` : "Builder projects"}
          description="Each project owns its teaching skill, allowed surfaces, widget style, and install setup."
        />
        <PanelBody className="p-0">
          <DataTable>
            <DataTableHeader>
              <Th>Project</Th>
              <Th>Skill</Th>
              <Th>Surfaces</Th>
              <Th>Setup</Th>
              <Th align="right">Action</Th>
            </DataTableHeader>
            <DataTableBody>
              {projects.map((project) => {
                const hasSkill = Boolean(project.skillContent.trim());
                const hasSurface = Boolean(project.allowedOrigins.length || project.allowedAppIds.length);
                return (
                  <Tr key={project.id}>
                    <Td>
                      <div className="font-bold text-gray-100">{project.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted">{project.skillId}</div>
                    </Td>
                    <Td>{hasSkill ? <StatusPill tone="green" label="Saved" /> : <StatusPill tone="amber" label="Draft needed" />}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {project.allowedOrigins.length ? <StatusPill tone="neutral" label="Web" /> : null}
                        {project.allowedAppIds.length ? <StatusPill tone="neutral" label="Native" /> : null}
                        {!hasSurface ? <StatusPill tone="amber" label="No surfaces" /> : null}
                      </div>
                    </Td>
                    <Td>
                      <StatusPill
                        tone={hasSkill && hasSurface ? "green" : "amber"}
                        label={hasSkill && hasSurface ? "Ready" : "Incomplete"}
                      />
                    </Td>
                    <Td align="right">
                      <ButtonLink href="/dashboard/setup" variant="secondary">Open setup</ButtonLink>
                    </Td>
                  </Tr>
                );
              })}
            </DataTableBody>
          </DataTable>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelBody>
          <div className="max-w-3xl text-sm leading-relaxed text-muted">
            Projects are now backed by the project data model. Workspace billing and keys remain shared at the workspace level; project-specific skill, surfaces, and widget style are scoped here.
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
