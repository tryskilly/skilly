"use server";

import { revalidatePath } from "next/cache";
import { getRepo } from "@/db";
import { validateSkillContent } from "@/domain/skillValidation";
import { captureServerEvent } from "@/lib/analytics";
import { requireDashboardSession, setDashboardSession } from "@/lib/dashboardAuth";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";

export interface CreateKeyState {
  rawKey?: string;
  error?: string;
}

/** Create a key and return its raw value ONCE (shown to the user, never re-shown). */
export async function createKeyAction(
  _previous: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  await requireDashboardSession();
  const keyType = formData.get("keyType") === "secret" ? "secret" : "publishable";
  const tenantId = await getCurrentDashboardTenantId();
  try {
    const { rawKey } = await getRepo().createApiKey(tenantId, keyType);
    await captureServerEvent("dashboard_key_created", {
      tenant_id: tenantId,
      key_type: keyType,
      source_surface: "web_dashboard",
    });
    revalidatePath("/dashboard", "layout");
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
  await requireDashboardSession();
  const keyId = String(formData.get("keyId") ?? "");
  const tenantId = await getCurrentDashboardTenantId();
  if (keyId) {
    await getRepo().revokeApiKey(tenantId, keyId);
    await captureServerEvent("dashboard_key_revoked", {
      tenant_id: tenantId,
      source_surface: "web_dashboard",
    });
    revalidatePath("/dashboard", "layout");
  }
}

/** Register a web origin allowed to use the widget publishable key. */
export async function addOriginAction(formData: FormData): Promise<void> {
  await requireDashboardSession();
  const origin = String(formData.get("origin") ?? "").trim();
  if (!origin) {
    return;
  }
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
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
  await requireDashboardSession();
  const origin = String(formData.get("origin") ?? "");
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
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
  await requireDashboardSession();
  const appId = String(formData.get("appId") ?? "").trim();
  if (!appId) {
    return;
  }
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
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
  await requireDashboardSession();
  const appId = String(formData.get("appId") ?? "");
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
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
  await requireDashboardSession();
  const content = String(formData.get("content") ?? "");
  const tenantId = await getCurrentDashboardTenantId();
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
  revalidatePath("/dashboard", "layout");
  return { ok: true, issues: [], savedAt: 0 };
}

// --- Widget config (Phase: dashboard completeness) ---
// Appearance/behavior controls surfaced in the embed snippet. accent + locale
// map directly to the data-skilly-accent / data-skilly-locale attrs the SDK reads.

export interface WidgetConfigState {
  ok?: boolean;
  accentColor?: string;
  locale?: string;
  launcherLabel?: string;
  error?: string;
}

const SUPPORTED_LOCALES = new Set(["en", "es", "fr", "de", "ja", "ar", "pt"]);

/** Validate + persist the tenant's widget config (accent, locale, launcher label). */
export async function saveWidgetConfigAction(
  _previous: WidgetConfigState,
  formData: FormData,
): Promise<WidgetConfigState> {
  await requireDashboardSession();
  const accentColor = sanitizeAccentColor(String(formData.get("accentColor") ?? "").trim());
  const locale = String(formData.get("locale") ?? "en").trim();
  const launcherLabel = String(formData.get("launcherLabel") ?? "").trim() || null;
  if (!accentColor) {
    return { error: "Accent color must be a hex color like #f59e0b." };
  }
  if (!SUPPORTED_LOCALES.has(locale)) {
    return { error: `Unsupported locale. Pick one of: ${[...SUPPORTED_LOCALES].join(", ")}.` };
  }
  const tenantId = await getCurrentDashboardTenantId();
  try {
    await getRepo().saveWidgetConfig(tenantId, { accentColor, locale, launcherLabel });
    await captureServerEvent("dashboard_widget_config_saved", {
      tenant_id: tenantId,
      locale,
      source_surface: "web_dashboard",
    });
    revalidatePath("/dashboard", "layout");
    return { ok: true, accentColor, locale, launcherLabel: launcherLabel ?? "" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "failed to save widget config" };
  }
}

/** Accept only well-formed #rrggbb hex colors to keep the snippet safe. */
function sanitizeAccentColor(value: string): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

// --- Tenant switching (super-admin convenience) ---
// A super_admin can switch the dashboard's active tenant without leaving their
// session. The session keeps super_admin role but is re-scoped to the chosen
// tenant id so every page renders as that tenant. This re-uses the signed
// session cookie machinery (dashboardAuth.ts).

/** Re-scope the current super_admin session to a different tenant. */
export async function switchTenantAction(formData: FormData): Promise<void> {
  const session = await requireDashboardSession("super_admin");
  const targetTenantId = String(formData.get("tenantId") ?? "");
  if (!targetTenantId || targetTenantId === session.tenantId) {
    return;
  }
  // Confirm the target tenant exists before scoping to it.
  const tenant = await getRepo().getTenant(targetTenantId);
  if (!tenant) {
    return;
  }
  await setDashboardSession({
    role: session.role,
    tenantId: targetTenantId,
    issuedAt: Date.now(),
    workosUserId: session.workosUserId,
    email: session.email ?? undefined,
    workosOrganizationId: session.workosOrganizationId ?? undefined,
  });
  await captureServerEvent("dashboard_tenant_switched", {
    tenant_id: targetTenantId,
    source_surface: "web_dashboard",
  });
  revalidatePath("/dashboard", "layout");
}

// --- Super-admin operations (Phase: dashboard completeness) ---
// Every action here requires super_admin. They power the tenant directory +
// member-management surface; a tenant_admin who somehow targets these is
// redirected away by requireDashboardSession("super_admin").

export interface CreateTenantState {
  tenantId?: string;
  error?: string;
}

/** Create a brand-new tenant workspace (super-admin onboarding a customer). */
export async function createTenantAction(
  _previous: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  await requireDashboardSession("super_admin");
  const name = String(formData.get("name") ?? "").trim();
  const capMinutes = Number(formData.get("capMinutes") ?? "0");
  if (!name) {
    return { error: "Tenant name is required." };
  }
  const capSeconds = Number.isFinite(capMinutes) && capMinutes > 0 ? Math.round(capMinutes * 60) : 0;
  try {
    const tenant = await getRepo().createTenant({ name, usageCapSeconds: capSeconds });
    await captureServerEvent("dashboard_tenant_created", {
      tenant_id: tenant.id,
      tenant_name: name,
      cap_seconds: capSeconds,
      source_surface: "web_dashboard",
    });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/admin/tenants", "layout");
    return { tenantId: tenant.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "failed to create tenant" };
  }
}

/** Adjust a tenant's monthly usage cap (super-admin grant/resize). */
export async function setTenantCapAction(formData: FormData): Promise<void> {
  await requireDashboardSession("super_admin");
  const tenantId = String(formData.get("tenantId") ?? "");
  const capMinutes = Number(formData.get("capMinutes") ?? "0");
  if (!tenantId) {
    return;
  }
  const capSeconds = Number.isFinite(capMinutes) && capMinutes > 0 ? Math.round(capMinutes * 60) : 0;
  await getRepo().setTenantUsageCap(tenantId, capSeconds);
  await captureServerEvent("dashboard_tenant_cap_updated", {
    tenant_id: tenantId,
    cap_seconds: capSeconds,
    source_surface: "web_dashboard",
  });
  revalidatePath("/dashboard/admin/tenants");
  revalidatePath(`/dashboard/admin/tenants/${tenantId}`);
}

/** Rename a tenant (super-admin / tenant-admin profile edit). */
export async function renameTenantAction(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) {
    return;
  }
  // A tenant_admin may only rename their own tenant; a super_admin may rename any.
  if (session.role !== "super_admin" && session.tenantId !== tenantId) {
    return;
  }
  await getRepo().updateTenantName(tenantId, name);
  await captureServerEvent("dashboard_tenant_renamed", {
    tenant_id: tenantId,
    source_surface: "web_dashboard",
  });
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/admin/tenants", "layout");
}

export interface AddMemberState {
  ok?: boolean;
  error?: string;
}

/**
 * Grant a WorkOS user a membership on a tenant (super-admin invite).
 * The workosUserId must already be a real WorkOS identity — we only map it to a
 * tenant here; we never create the WorkOS user.
 */
export async function addMemberAction(
  _previous: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  await requireDashboardSession("super_admin");
  const tenantId = String(formData.get("tenantId") ?? "");
  const workosUserId = String(formData.get("workosUserId") ?? "").trim();
  const role = formData.get("role") === "super_admin" ? "super_admin" : "tenant_admin";
  const email = String(formData.get("email") ?? "").trim() || null;
  if (!tenantId || !workosUserId) {
    return { error: "Tenant and WorkOS user id are required." };
  }
  try {
    await getRepo().upsertDashboardMembership({ workosUserId, tenantId, role, email });
    await captureServerEvent("dashboard_member_added", {
      tenant_id: tenantId,
      role,
      source_surface: "web_dashboard",
    });
    revalidatePath(`/dashboard/admin/tenants/${tenantId}`);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "failed to add member" };
  }
}

export interface RemoveMemberState {
  ok?: boolean;
  error?: string;
}

/** Remove a member from a tenant (refuses the last super_admin). */
export async function removeMemberAction(
  _previous: RemoveMemberState,
  formData: FormData,
): Promise<RemoveMemberState> {
  await requireDashboardSession("super_admin");
  const tenantId = String(formData.get("tenantId") ?? "");
  const workosUserId = String(formData.get("workosUserId") ?? "");
  if (!tenantId || !workosUserId) {
    return { error: "Tenant and WorkOS user id are required." };
  }
  const result = await getRepo().deleteDashboardMembership(tenantId, workosUserId);
  if (!result.removed) {
    return {
      error:
        result.reason === "last_super_admin"
          ? "Can't remove the last super admin. Promote another member first."
          : "That member was not found.",
    };
  }
  await captureServerEvent("dashboard_member_removed", {
    tenant_id: tenantId,
    source_surface: "web_dashboard",
  });
  revalidatePath(`/dashboard/admin/tenants/${tenantId}`);
  return { ok: true };
}
