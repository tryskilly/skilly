// Data-access contract for the control plane. Route handlers depend on this
// interface, not on Postgres directly — so the domain flow is testable against
// the in-memory implementation and swappable for Postgres in production.

import type { KeyType } from "../domain/keys";
import type { DashboardRole } from "../lib/dashboardAuth";

export interface Tenant {
  id: string;
  name: string;
  allowedOrigins: string[];
  /** Allowed native app ids (iOS bundle id / Android package name) for the mobile SDK. */
  allowedAppIds: string[];
  usageCapSeconds: number;
  /** Polar customer id, captured from the subscription webhook so we can open a customer-portal session. */
  polarCustomerId: string | null;
}

export interface KeyLookup {
  tenant: Tenant;
  keyType: KeyType;
}

export interface TenantSkill {
  tenantId: string;
  skillId: string;
  content: string;
}

export interface UsageEvent {
  tenantId: string;
  kind: "token_mint" | "session_seconds";
  seconds: number;
}

/** Display-safe key metadata for the dashboard (never includes the raw key). */
export interface ApiKeyInfo {
  id: string;
  keyType: KeyType;
  prefix: string;
  last4: string;
  revoked: boolean;
}

export interface UsageSummary {
  usageSecondsThisPeriod: number;
  capSeconds: number;
}

/** Per-tenant widget appearance/behavior config surfaced in the embed snippet. */
export interface WidgetConfig {
  accentColor: string;
  locale: string;
  launcherLabel: string | null;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  accentColor: "#f59e0b",
  locale: "en",
  launcherLabel: null,
};

export interface DashboardMembership {
  workosUserId: string;
  tenantId: string;
  role: DashboardRole;
  email: string | null;
  workosOrganizationId: string | null;
}

export interface DashboardMembershipLookup {
  workosUserId: string;
  workosOrganizationId?: string | null;
}

export interface DashboardMembershipInput extends DashboardMembershipLookup {
  tenantId: string;
  role: DashboardRole;
  email?: string | null;
}

export interface WebBackendRepo {
  /** Look up a tenant + key type by the key's sha256 hash. Null if unknown/revoked. */
  findTenantByKeyHash(keyHash: string): Promise<KeyLookup | null>;
  /** The tenant's compiled SKILL.md for `skillId`, or null. */
  getTenantSkill(tenantId: string, skillId: string): Promise<TenantSkill | null>;
  /** Seconds of metered usage for the tenant in the current billing period. */
  getUsageSecondsThisPeriod(tenantId: string): Promise<number>;
  /** Append a metered usage event. */
  recordUsage(event: UsageEvent): Promise<void>;
  /** Recent raw usage events for the tenant (newest first), capped at `limit`. */
  listUsageEvents(tenantId: string, limit: number): Promise<Array<UsageEvent & { createdAt: Date }>>;

  // --- Dashboard (Phase 8.5) ---
  /** Super-admin tenant directory. */
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  /** Create a new tenant. The id is generated server-side; returns the full tenant. */
  createTenant(input: {
    name: string;
    allowedOrigins?: string[];
    allowedAppIds?: string[];
    usageCapSeconds?: number;
  }): Promise<Tenant>;
  /** Rename a tenant (super-admin / tenant-admin profile edit). */
  updateTenantName(tenantId: string, name: string): Promise<void>;
  /** Resolve dashboard access from WorkOS identity to an explicit tenant membership. */
  findDashboardMembership(lookup: DashboardMembershipLookup): Promise<DashboardMembership | null>;
  /** Create or update a dashboard membership for a verified WorkOS identity. */
  upsertDashboardMembership(input: DashboardMembershipInput): Promise<DashboardMembership>;
  /** Every membership for a tenant (member management / drill-in view). */
  listDashboardMemberships(tenantId: string): Promise<DashboardMembership[]>;
  /** Remove a membership. Refuses to remove the last super_admin of a tenant. */
  deleteDashboardMembership(
    tenantId: string,
    workosUserId: string,
  ): Promise<{ removed: boolean; reason?: "last_super_admin" | "not_found" }>;
  listApiKeys(tenantId: string): Promise<ApiKeyInfo[]>;
  /** Create a key; returns the raw value ONCE (caller shows it, never stored raw). */
  createApiKey(tenantId: string, keyType: KeyType): Promise<{ rawKey: string; info: ApiKeyInfo }>;
  revokeApiKey(tenantId: string, keyId: string): Promise<void>;
  saveTenantSkill(tenantId: string, skillId: string, content: string): Promise<void>;
  getUsageSummary(tenantId: string): Promise<UsageSummary>;

  // --- Billing (Phase 8.6) ---
  /** Set the tenant's monthly usage cap (0 = unlimited / no paid access). */
  setTenantUsageCap(tenantId: string, capSeconds: number): Promise<void>;
  /** Persist the Polar customer id captured from a subscription webhook. */
  setTenantPolarCustomerId(tenantId: string, polarCustomerId: string): Promise<void>;

  // --- Web origin tenancy ---
  /** Replace the tenant's allowed web origins. Supports "*.domain" wildcards. */
  setTenantOrigins(tenantId: string, origins: string[]): Promise<void>;

  // --- Mobile app-id tenancy (Phase 9.0) ---
  /** Replace the tenant's allowed native app ids (iOS bundle id / Android package). */
  setTenantAppIds(tenantId: string, appIds: string[]): Promise<void>;

  // --- Widget config (Phase: dashboard completeness) ---
  /** The tenant's widget config, or the defaults if none saved. */
  getWidgetConfig(tenantId: string): Promise<WidgetConfig>;
  /** Save the tenant's widget config (upsert). */
  saveWidgetConfig(tenantId: string, config: WidgetConfig): Promise<void>;
}
