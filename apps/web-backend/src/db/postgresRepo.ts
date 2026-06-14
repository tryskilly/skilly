// Postgres implementation of WebBackendRepo (node-postgres). Compiles without a
// database; it connects lazily on first query. Schema changes are owned by
// Drizzle migrations in db/migrations.

import { Pool } from "pg";
import { generateKey, hashKey, keyDisplay, type KeyType } from "../domain/keys";
import type {
  ApiKeyInfo,
  DashboardMembership,
  DashboardMembershipInput,
  DashboardMembershipLookup,
  KeyLookup,
  Tenant,
  TenantSkill,
  UsageEvent,
  UsageSummary,
  WebBackendRepo,
  WidgetConfig,
} from "./repo";
import { DEFAULT_WIDGET_CONFIG } from "./repo";

export class PostgresRepo implements WebBackendRepo {
  constructor(private readonly pool: Pool) {}

  async findTenantByKeyHash(keyHash: string): Promise<KeyLookup | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
      polar_customer_id: string | null;
      key_type: "publishable" | "secret";
    }>(
      `SELECT t.id, t.name, t.allowed_origins, t.allowed_app_ids, t.usage_cap_seconds, t.polar_customer_id, k.key_type
         FROM api_keys k
         JOIN tenants t ON t.id = k.tenant_id
        WHERE k.key_hash = $1 AND k.revoked = false
        LIMIT 1`,
      [keyHash],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      tenant: {
        id: row.id,
        name: row.name,
        allowedOrigins: row.allowed_origins,
        allowedAppIds: row.allowed_app_ids,
        usageCapSeconds: row.usage_cap_seconds,
        polarCustomerId: row.polar_customer_id,
      },
      keyType: row.key_type,
    };
  }

  async getTenantSkill(tenantId: string, skillId: string): Promise<TenantSkill | null> {
    const result = await this.pool.query<{ content: string }>(
      `SELECT content FROM tenant_skills WHERE tenant_id = $1 AND skill_id = $2 LIMIT 1`,
      [tenantId, skillId],
    );
    const row = result.rows[0];
    return row ? { tenantId, skillId, content: row.content } : null;
  }

  async getUsageSecondsThisPeriod(tenantId: string): Promise<number> {
    const result = await this.pool.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(seconds), 0) AS total
         FROM usage_events
        WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
      [tenantId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_events (tenant_id, kind, seconds) VALUES ($1, $2, $3)`,
      [event.tenantId, event.kind, event.seconds],
    );
  }

  async listUsageEvents(
    tenantId: string,
    limit: number,
  ): Promise<Array<UsageEvent & { createdAt: Date }>> {
    const result = await this.pool.query<{
      tenant_id: string;
      kind: string;
      seconds: number;
      created_at: Date;
    }>(
      `SELECT tenant_id, kind, seconds, created_at
         FROM usage_events
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [tenantId, limit],
    );
    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      kind: row.kind as UsageEvent["kind"],
      seconds: row.seconds,
      createdAt: row.created_at,
    }));
  }

  async listTenants(): Promise<Tenant[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
      polar_customer_id: string | null;
    }>(
      `SELECT id, name, allowed_origins, allowed_app_ids, usage_cap_seconds, polar_customer_id FROM tenants ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      allowedOrigins: row.allowed_origins,
      allowedAppIds: row.allowed_app_ids,
      usageCapSeconds: row.usage_cap_seconds,
      polarCustomerId: row.polar_customer_id,
    }));
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
      polar_customer_id: string | null;
    }>(
      `SELECT id, name, allowed_origins, allowed_app_ids, usage_cap_seconds, polar_customer_id FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          allowedOrigins: row.allowed_origins,
          allowedAppIds: row.allowed_app_ids,
          usageCapSeconds: row.usage_cap_seconds,
          polarCustomerId: row.polar_customer_id,
        }
      : null;
  }

  async createTenant(input: {
    name: string;
    allowedOrigins?: string[];
    allowedAppIds?: string[];
    usageCapSeconds?: number;
  }): Promise<Tenant> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
      polar_customer_id: string | null;
    }>(
      `INSERT INTO tenants (name, allowed_origins, allowed_app_ids, usage_cap_seconds)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, allowed_origins, allowed_app_ids, usage_cap_seconds, polar_customer_id`,
      [
        input.name,
        input.allowedOrigins ?? [],
        input.allowedAppIds ?? [],
        input.usageCapSeconds ?? 0,
      ],
    );
    const row = result.rows[0]!;
    return {
      id: row.id,
      name: row.name,
      allowedOrigins: row.allowed_origins,
      allowedAppIds: row.allowed_app_ids,
      usageCapSeconds: row.usage_cap_seconds,
      polarCustomerId: row.polar_customer_id,
    };
  }

  async updateTenantName(tenantId: string, name: string): Promise<void> {
    await this.pool.query(`UPDATE tenants SET name = $2 WHERE id = $1`, [tenantId, name]);
  }

  async findDashboardMembership(lookup: DashboardMembershipLookup): Promise<DashboardMembership | null> {
    const result = await this.pool.query<{
      workos_user_id: string;
      tenant_id: string;
      role: "tenant_admin" | "super_admin";
      email: string | null;
      workos_organization_id: string | null;
    }>(
      `SELECT workos_user_id, tenant_id, role, email, workos_organization_id
         FROM dashboard_memberships
        WHERE workos_user_id = $1
        ORDER BY
          CASE
            WHEN $2::text IS NOT NULL AND workos_organization_id = $2 THEN 0
            WHEN workos_organization_id IS NULL THEN 1
            ELSE 2
          END,
          created_at ASC
        LIMIT 1`,
      [lookup.workosUserId, lookup.workosOrganizationId ?? null],
    );
    const row = result.rows[0];
    return row
      ? {
          workosUserId: row.workos_user_id,
          tenantId: row.tenant_id,
          role: row.role,
          email: row.email,
          workosOrganizationId: row.workos_organization_id,
        }
      : null;
  }

  async upsertDashboardMembership(input: DashboardMembershipInput): Promise<DashboardMembership> {
    const result = await this.pool.query<{
      workos_user_id: string;
      tenant_id: string;
      role: "tenant_admin" | "super_admin";
      email: string | null;
      workos_organization_id: string | null;
    }>(
      `INSERT INTO dashboard_memberships (
         workos_user_id,
         tenant_id,
         role,
         email,
         workos_organization_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workos_user_id, tenant_id) DO UPDATE SET
         role = EXCLUDED.role,
         email = EXCLUDED.email,
         workos_organization_id = EXCLUDED.workos_organization_id
       RETURNING workos_user_id, tenant_id, role, email, workos_organization_id`,
      [
        input.workosUserId,
        input.tenantId,
        input.role,
        input.email ?? null,
        input.workosOrganizationId ?? null,
      ],
    );
    const row = result.rows[0]!;
    return {
      workosUserId: row.workos_user_id,
      tenantId: row.tenant_id,
      role: row.role,
      email: row.email,
      workosOrganizationId: row.workos_organization_id,
    };
  }

  async listDashboardMemberships(tenantId: string): Promise<DashboardMembership[]> {
    const result = await this.pool.query<{
      workos_user_id: string;
      tenant_id: string;
      role: "tenant_admin" | "super_admin";
      email: string | null;
      workos_organization_id: string | null;
    }>(
      `SELECT workos_user_id, tenant_id, role, email, workos_organization_id
         FROM dashboard_memberships
        WHERE tenant_id = $1
        ORDER BY created_at ASC`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      workosUserId: row.workos_user_id,
      tenantId: row.tenant_id,
      role: row.role,
      email: row.email,
      workosOrganizationId: row.workos_organization_id,
    }));
  }

  async deleteDashboardMembership(
    tenantId: string,
    workosUserId: string,
  ): Promise<{ removed: boolean; reason?: "last_super_admin" | "not_found" }> {
    const target = await this.pool.query<{ role: "tenant_admin" | "super_admin" }>(
      `SELECT role FROM dashboard_memberships WHERE tenant_id = $1 AND workos_user_id = $2`,
      [tenantId, workosUserId],
    );
    if (target.rows.length === 0) {
      return { removed: false, reason: "not_found" };
    }
    // Refuse to remove the last super_admin of a tenant — that would orphan it.
    if (target.rows[0]!.role === "super_admin") {
      const otherSuperAdmins = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM dashboard_memberships
          WHERE tenant_id = $1
            AND role = 'super_admin'
            AND workos_user_id <> $2`,
        [tenantId, workosUserId],
      );
      if (Number(otherSuperAdmins.rows[0]?.count ?? 0) === 0) {
        return { removed: false, reason: "last_super_admin" };
      }
    }
    await this.pool.query(
      `DELETE FROM dashboard_memberships WHERE tenant_id = $1 AND workos_user_id = $2`,
      [tenantId, workosUserId],
    );
    return { removed: true };
  }

  async listApiKeys(tenantId: string): Promise<ApiKeyInfo[]> {
    const result = await this.pool.query<{
      id: string;
      key_type: KeyType;
      key_prefix: string;
      key_last4: string;
      revoked: boolean;
    }>(
      `SELECT id, key_type, key_prefix, key_last4, revoked
         FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      keyType: row.key_type,
      prefix: row.key_prefix,
      last4: row.key_last4,
      revoked: row.revoked,
    }));
  }

  async createApiKey(tenantId: string, keyType: KeyType): Promise<{ rawKey: string; info: ApiKeyInfo }> {
    const rawKey = generateKey(keyType);
    const display = keyDisplay(rawKey);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO api_keys (tenant_id, key_type, key_hash, key_prefix, key_last4)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, keyType, hashKey(rawKey), display.prefix, display.last4],
    );
    const id = result.rows[0]!.id;
    return { rawKey, info: { id, keyType, prefix: display.prefix, last4: display.last4, revoked: false } };
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<void> {
    await this.pool.query(`UPDATE api_keys SET revoked = true WHERE tenant_id = $1 AND id = $2`, [tenantId, keyId]);
  }

  async saveTenantSkill(tenantId: string, skillId: string, content: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tenant_skills (tenant_id, skill_id, content) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, skill_id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
      [tenantId, skillId, content],
    );
  }

  async getUsageSummary(tenantId: string): Promise<UsageSummary> {
    const usageSecondsThisPeriod = await this.getUsageSecondsThisPeriod(tenantId);
    const result = await this.pool.query<{ usage_cap_seconds: number }>(
      `SELECT usage_cap_seconds FROM tenants WHERE id = $1`,
      [tenantId],
    );
    return { usageSecondsThisPeriod, capSeconds: Number(result.rows[0]?.usage_cap_seconds ?? 0) };
  }

  async setTenantUsageCap(tenantId: string, capSeconds: number): Promise<void> {
    await this.pool.query(`UPDATE tenants SET usage_cap_seconds = $2 WHERE id = $1`, [tenantId, capSeconds]);
  }

  async setTenantPolarCustomerId(tenantId: string, polarCustomerId: string): Promise<void> {
    await this.pool.query(`UPDATE tenants SET polar_customer_id = $2 WHERE id = $1`, [
      tenantId,
      polarCustomerId,
    ]);
  }

  async setTenantOrigins(tenantId: string, origins: string[]): Promise<void> {
    await this.pool.query(`UPDATE tenants SET allowed_origins = $2 WHERE id = $1`, [tenantId, origins]);
  }

  async setTenantAppIds(tenantId: string, appIds: string[]): Promise<void> {
    await this.pool.query(`UPDATE tenants SET allowed_app_ids = $2 WHERE id = $1`, [tenantId, appIds]);
  }

  async getWidgetConfig(tenantId: string): Promise<WidgetConfig> {
    const result = await this.pool.query<{
      accent_color: string;
      locale: string;
      launcher_label: string | null;
    }>(`SELECT accent_color, locale, launcher_label FROM tenant_widget_configs WHERE tenant_id = $1`, [
      tenantId,
    ]);
    const row = result.rows[0];
    return row
      ? { accentColor: row.accent_color, locale: row.locale, launcherLabel: row.launcher_label }
      : { ...DEFAULT_WIDGET_CONFIG };
  }

  async saveWidgetConfig(tenantId: string, config: WidgetConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO tenant_widget_configs (tenant_id, accent_color, locale, launcher_label)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE SET
           accent_color = EXCLUDED.accent_color,
           locale = EXCLUDED.locale,
           launcher_label = EXCLUDED.launcher_label,
           updated_at = now()`,
      [tenantId, config.accentColor, config.locale, config.launcherLabel],
    );
  }
}
