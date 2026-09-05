import { MAX_SKILL_CHARS, validateSkillContent } from "@/domain/skillValidation";

export const SIGNUP_HANDOFF_STORAGE_KEY = "skilly_signup_handoff_v1";
export const SIGNUP_HANDOFF_TTL_MS = 30 * 60 * 1000;
export const MAX_HANDOFF_URL_CHARS = 2_048;
export const MAX_HANDOFF_GOAL_CHARS = 500;

export interface SignupHandoff {
  auditUrl: string;
  activationGoal: string;
  prefillSkill: string;
}

export interface SignupHandoffValidation {
  ok: boolean;
  value?: SignupHandoff;
  issues: string[];
}

export function canImportIntoProject(existingSkillContent: string): boolean {
  return existingSkillContent.trim().length === 0;
}

export function parseStoredSignupHandoff(raw: string | null, now = Date.now()): SignupHandoffValidation {
  if (!raw) return { ok: false, issues: ["No pending signup draft."] };
  try {
    const stored = JSON.parse(raw) as { handoff?: Partial<SignupHandoff>; expiresAt?: number };
    if (typeof stored.expiresAt !== "number" || stored.expiresAt < now) {
      return { ok: false, issues: ["The signup draft expired."] };
    }
    return sanitizeSignupHandoff(stored.handoff ?? {});
  } catch {
    return { ok: false, issues: ["The signup draft is malformed."] };
  }
}

/** Structural validation used by the signup page before placing data in localStorage. */
export function sanitizeSignupHandoff(input: Partial<SignupHandoff>): SignupHandoffValidation {
  const issues: string[] = [];
  const auditUrl = typeof input.auditUrl === "string" ? input.auditUrl.trim() : "";
  const activationGoal = typeof input.activationGoal === "string" ? input.activationGoal.trim() : "";
  const prefillSkill = typeof input.prefillSkill === "string" ? input.prefillSkill.trim() : "";

  if (!auditUrl || auditUrl.length > MAX_HANDOFF_URL_CHARS) {
    issues.push("The audit URL is missing or too long.");
  } else {
    try {
      const parsed = new URL(auditUrl);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
        issues.push("The audit URL must be a public HTTP(S) URL.");
      }
    } catch {
      issues.push("The audit URL is invalid.");
    }
  }
  if (activationGoal.length > MAX_HANDOFF_GOAL_CHARS) {
    issues.push("The activation goal is too long.");
  }
  if (!prefillSkill || prefillSkill.length > MAX_SKILL_CHARS) {
    issues.push("The generated skill is missing or too long.");
  } else {
    issues.push(...validateSkillContent(prefillSkill).issues);
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: { auditUrl, activationGoal, prefillSkill }, issues: [] };
}
