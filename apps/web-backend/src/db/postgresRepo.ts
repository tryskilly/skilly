// Postgres implementation of WebBackendRepo (node-postgres). Compiles without a
// database; it connects lazily on first query. Schema: db/schema.sql.

import { Pool } from "pg";
import type { KeyLookup, TenantSkill, UsageEvent, WebBackendRepo } from "./repo";

export class PostgresRepo implements WebBackendRepo {
  constructor(private readonly pool: Pool) {}

  async findTenantByKeyHash(keyHash: string): Promise<KeyLookup | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      allowed_origins: string[];
      usage_cap_seconds: number;
      key_type: "publishable" | "secret";
    }>(
      `SELECT t.id, t.name, t.allowed_origins, t.usage_cap_seconds, k.key_type
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
}
