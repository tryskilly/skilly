import { assertImportableUrl, type ResolveHost } from "@/domain/siteImport";
import type { WebBackendRepo } from "@/db/repo";
import { sanitizeSignupHandoff, type SignupHandoff } from "./signupHandoff";

export type SignupHandoffApplyResult =
  | { ok: true; reviewPath: "/dashboard/skill"; auditUrl: string }
  | { ok: false; status: 422 | 409; error: string; issues?: string[] };

export async function applySignupHandoff(
  repo: WebBackendRepo,
  tenantId: string,
  input: Partial<SignupHandoff>,
  resolveHost?: ResolveHost,
): Promise<SignupHandoffApplyResult> {
  const validation = sanitizeSignupHandoff(input);
  if (!validation.ok || !validation.value) return { ok: false, status: 422, error: "invalid handoff", issues: validation.issues };
  try {
    await assertImportableUrl(validation.value.auditUrl, resolveHost);
  } catch (error) {
    return { ok: false, status: 422, error: "invalid handoff", issues: [error instanceof Error ? error.message : "The audit URL cannot be imported."] };
  }
  const imported = await repo.importProjectSkillIfEmpty(tenantId, validation.value.prefillSkill);
  if (!imported.saved) return { ok: false, status: 409, error: "existing_skill" };
  return { ok: true, reviewPath: "/dashboard/skill", auditUrl: validation.value.auditUrl };
}
