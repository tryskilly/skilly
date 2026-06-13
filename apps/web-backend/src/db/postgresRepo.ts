// Postgres implementation of WebBackendRepo (node-postgres). Compiles without a
// database; it connects lazily on first query. Schema: db/schema.sql.

import { Pool } from "pg";
import { generateKey, hashKey, keyDisplay, type KeyType } from "../domain/keys";
import type {
  ApiKeyInfo,
  KeyLookup,
  Tenant,
  TenantSkill,
  UsageEvent,
  UsageSummary,
  WebBackendRepo,
} from "./repo";

export class PostgresRepo implements WebBackendRepo {
  constructor(private readonly pool: Pool) {}

  async findTenantByKeyHash(keyHash: string): Promise<KeyLookup | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
      key_type: "publishable" | "secret";
    }>(
      `SELECT t.id, t.name, t.allowed_origins, t.allowed_app_ids, t.usage_cap_seconds, k.key_type
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

  async listTenants(): Promise<Tenant[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
    }>(`SELECT id, name, allowed_origins, allowed_app_ids, usage_cap_seconds FROM tenants ORDER BY created_at DESC`);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      allowedOrigins: row.allowed_origins,
      allowedAppIds: row.allowed_app_ids,
      usageCapSeconds: row.usage_cap_seconds,
    }));
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      allowed_app_ids: string[];
      usage_cap_seconds: number;
    }>(
      `SELECT id, name, allowed_origins, allowed_app_ids, usage_cap_seconds FROM tenants WHERE id = $1`,
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
        }
      : null;
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

  async setTenantOrigins(tenantId: string, origins: string[]): Promise<void> {
    await this.pool.query(`UPDATE tenants SET allowed_origins = $2 WHERE id = $1`, [tenantId, origins]);
  }

  async setTenantAppIds(tenantId: string, appIds: string[]): Promise<void> {
    await this.pool.query(`UPDATE tenants SET allowed_app_ids = $2 WHERE id = $1`, [tenantId, appIds]);
  }
}
