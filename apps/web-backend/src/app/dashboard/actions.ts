"use server";

import { revalidatePath } from "next/cache";
import { getRepo } from "@/db";
import { validateSkillContent } from "@/domain/skillValidation";
import { DEFAULT_SKILL_ID, getCurrentTenantId } from "@/lib/session";

export interface CreateKeyState {
  rawKey?: string;
  error?: string;
}

/** Create a key and return its raw value ONCE (shown to the user, never re-shown). */
export async function createKeyAction(
  _previous: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const keyType = formData.get("keyType") === "secret" ? "secret" : "publishable";
  try {
    const { rawKey } = await getRepo().createApiKey(getCurrentTenantId(), keyType);
    revalidatePath("/dashboard");
    return { rawKey };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "failed to create key" };
  }
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const keyId = String(formData.get("keyId") ?? "");
  if (keyId) {
    await getRepo().revokeApiKey(getCurrentTenantId(), keyId);
    revalidatePath("/dashboard");
  }
}

export interface SaveSkillState {
  ok?: boolean;
  issues?: string[];
  savedAt?: number;
}

/** Validate (safety scan) then save the tenant's SKILL.md. */
export async function saveSkillAction(
  _previous: SaveSkillState,
  formData: FormData,
): Promise<SaveSkillState> {
  const content = String(formData.get("content") ?? "");
  const validation = validateSkillContent(content);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  await getRepo().saveTenantSkill(getCurrentTenantId(), DEFAULT_SKILL_ID, content);
  revalidatePath("/dashboard/skill");
  return { ok: true, issues: [], savedAt: 0 };
}
