"use server";

import { revalidatePath } from "next/cache";
import { getRepo } from "@/db";
import { validateSkillContent } from "@/domain/skillValidation";
import { captureServerEvent } from "@/lib/analytics";
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
  const tenantId = getCurrentTenantId();
  try {
    const { rawKey } = await getRepo().createApiKey(tenantId, keyType);
    await captureServerEvent("dashboard_key_created", {
      tenant_id: tenantId,
      key_type: keyType,
      source_surface: "web_dashboard",
    });
    revalidatePath("/dashboard");
    return { rawKey };
  } catch (error) {
    await captureServerEvent("dashboard_key_create_failed", {
      tenant_id: tenantId,
      key_type: keyType,
      error_message: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      source_surface: "web_dashboard",
    });
    return { error: error instanceof Error ? error.message : "failed to create key" };
  }
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const keyId = String(formData.get("keyId") ?? "");
  const tenantId = getCurrentTenantId();
  if (keyId) {
    await getRepo().revokeApiKey(tenantId, keyId);
    await captureServerEvent("dashboard_key_revoked", {
      tenant_id: tenantId,
      source_surface: "web_dashboard",
    });
    revalidatePath("/dashboard");
  }
}

/** Register a web origin allowed to use the widget publishable key. */
export async function addOriginAction(formData: FormData): Promise<void> {
  const origin = String(formData.get("origin") ?? "").trim();
  if (!origin) {
    return;
  }
  const repo = getRepo();
  const tenantId = getCurrentTenantId();
  const tenant = await repo.getTenant(tenantId);
  if (tenant && !tenant.allowedOrigins.includes(origin)) {
    await repo.setTenantOrigins(tenantId, [...tenant.allowedOrigins, origin]);
    await captureServerEvent("dashboard_origin_added", {
      tenant_id: tenantId,
      origin_count: tenant.allowedOrigins.length + 1,
      source_surface: "web_dashboard",
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/origins");
}

export async function removeOriginAction(formData: FormData): Promise<void> {
  const origin = String(formData.get("origin") ?? "");
  const repo = getRepo();
  const tenantId = getCurrentTenantId();
  const tenant = await repo.getTenant(tenantId);
  if (tenant) {
    await repo.setTenantOrigins(
      tenantId,
      tenant.allowedOrigins.filter((existing) => existing !== origin),
    );
    await captureServerEvent("dashboard_origin_removed", {
      tenant_id: tenantId,
      origin_count: Math.max(0, tenant.allowedOrigins.length - 1),
      source_surface: "web_dashboard",
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/origins");
}

/** Register a native app id (iOS bundle id / Android package) for the mobile SDK. */
export async function addAppIdAction(formData: FormData): Promise<void> {
  const appId = String(formData.get("appId") ?? "").trim();
  if (!appId) {
    return;
  }
  const repo = getRepo();
  const tenantId = getCurrentTenantId();
  const tenant = await repo.getTenant(tenantId);
  if (tenant && !tenant.allowedAppIds.includes(appId)) {
    await repo.setTenantAppIds(tenantId, [...tenant.allowedAppIds, appId]);
    await captureServerEvent("dashboard_app_id_added", {
      tenant_id: tenantId,
      app_id_count: tenant.allowedAppIds.length + 1,
      source_surface: "web_dashboard",
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/origins");
}

export async function removeAppIdAction(formData: FormData): Promise<void> {
  const appId = String(formData.get("appId") ?? "");
  const repo = getRepo();
  const tenantId = getCurrentTenantId();
  const tenant = await repo.getTenant(tenantId);
  if (tenant) {
    await repo.setTenantAppIds(
      tenantId,
      tenant.allowedAppIds.filter((existing) => existing !== appId),
    );
    await captureServerEvent("dashboard_app_id_removed", {
      tenant_id: tenantId,
      app_id_count: Math.max(0, tenant.allowedAppIds.length - 1),
      source_surface: "web_dashboard",
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/origins");
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
  const tenantId = getCurrentTenantId();
  const validation = validateSkillContent(content);
  if (!validation.ok) {
    await captureServerEvent("dashboard_skill_validation_failed", {
      tenant_id: tenantId,
      issue_count: validation.issues.length,
      source_surface: "web_dashboard",
    });
    return { ok: false, issues: validation.issues };
  }
  await getRepo().saveTenantSkill(tenantId, DEFAULT_SKILL_ID, content);
  await captureServerEvent("dashboard_skill_saved", {
    tenant_id: tenantId,
    skill_id: DEFAULT_SKILL_ID,
    content_length: content.length,
    source_surface: "web_dashboard",
  });
  revalidatePath("/dashboard/skill");
  return { ok: true, issues: [], savedAt: 0 };
}
