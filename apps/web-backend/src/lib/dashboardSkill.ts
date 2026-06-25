import type { TenantSkill, WebBackendRepo } from "@/db/repo";
import { DEFAULT_SKILL_ID } from "./session";

export interface DashboardSkillSelection {
  skillId: string;
  skill: TenantSkill | null;
}

/**
 * Dashboard-owned skill selection.
 *
 * New tenants use the neutral `default` skill id. Existing production tenants
 * may already have a named skill from pre-dashboard setup, so fall back to the
 * first saved skill instead of showing an empty editor/snippet.
 */
export async function getDashboardSkillSelection(
  repo: WebBackendRepo,
  tenantId: string,
): Promise<DashboardSkillSelection> {
  const project = await repo.ensureDefaultProject(tenantId);
  if (project.skillContent.trim()) {
    return {
      skillId: project.skillId,
      skill: {
        tenantId,
        skillId: project.skillId,
        content: project.skillContent,
      },
    };
  }

  const defaultSkill = await repo.getTenantSkill(tenantId, DEFAULT_SKILL_ID);
  if (defaultSkill) {
    return { skillId: DEFAULT_SKILL_ID, skill: defaultSkill };
  }

  const [firstSkill] = await repo.listTenantSkills(tenantId);
  if (firstSkill) {
    return { skillId: firstSkill.skillId, skill: firstSkill };
  }

  return { skillId: DEFAULT_SKILL_ID, skill: null };
}
