// Data-access contract for the control plane. Route handlers depend on this
// interface, not on Postgres directly — so the domain flow is testable against
// the in-memory implementation and swappable for Postgres in production.

import type { KeyType } from "../domain/keys";

export interface Tenant {
  id: string;
  name: string;
  allowedOrigins: string[];
  usageCapSeconds: number;
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

export interface WebBackendRepo {
  /** Look up a tenant + key type by the key's sha256 hash. Null if unknown/revoked. */
  findTenantByKeyHash(keyHash: string): Promise<KeyLookup | null>;
  /** The tenant's compiled SKILL.md for `skillId`, or null. */
  getTenantSkill(tenantId: string, skillId: string): Promise<TenantSkill | null>;
  /** Seconds of metered usage for the tenant in the current billing period. */
  getUsageSecondsThisPeriod(tenantId: string): Promise<number>;
  /** Append a metered usage event. */
  recordUsage(event: UsageEvent): Promise<void>;
}
