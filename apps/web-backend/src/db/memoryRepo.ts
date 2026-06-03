// In-memory repo for local dev (no DATABASE_URL) and unit tests. Seeded with one
// demo tenant whose publishable key + skill let the @skilly/web demo connect.

import { hashKey, type KeyType } from "../domain/keys";
import type { KeyLookup, Tenant, TenantSkill, UsageEvent, WebBackendRepo } from "./repo";

interface SeededKey {
  keyHash: string;
  keyType: KeyType;
  tenantId: string;
  revoked: boolean;
}

export interface MemorySeed {
  tenants: Tenant[];
  keys: Array<{ rawKey: string; keyType: KeyType; tenantId: string; revoked?: boolean }>;
  skills: TenantSkill[];
}

/** A demo tenant so the local widget works out of the box. */
export const DEMO_PUBLISHABLE_KEY = "pk_test_demolocaldemolocaldemolocal01";

export function defaultSeed(): MemorySeed {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  return {
    tenants: [
      {
        id: tenantId,
        name: "Acme Inc. (demo)",
        allowedOrigins: ["http://localhost:4399", "http://localhost:4310", "https://*.acme.com"],
        usageCapSeconds: 10_800, // 3h, mirrors the desktop monthly cap default
      },
    ],
    keys: [{ rawKey: DEMO_PUBLISHABLE_KEY, keyType: "publishable", tenantId }],
    skills: [
      {
        tenantId,
        skillId: "acme-onboarding",
        content: "# Acme Onboarding\n\nGuide the user through setting up their first project.",
      },
    ],
  };
}

export class MemoryRepo implements WebBackendRepo {
  private tenants = new Map<string, Tenant>();
  private keys = new Map<string, SeededKey>();
  private skills = new Map<string, TenantSkill>();
  private usage: UsageEvent[] = [];

  constructor(seed: MemorySeed = defaultSeed()) {
    for (const tenant of seed.tenants) {
      this.tenants.set(tenant.id, tenant);
    }
    for (const key of seed.keys) {
      const keyHash = hashKey(key.rawKey);
      this.keys.set(keyHash, {
        keyHash,
        keyType: key.keyType,
        tenantId: key.tenantId,
        revoked: key.revoked ?? false,
      });
    }
    for (const skill of seed.skills) {
      this.skills.set(`${skill.tenantId}:${skill.skillId}`, skill);
    }
  }

  async findTenantByKeyHash(keyHash: string): Promise<KeyLookup | null> {
    const record = this.keys.get(keyHash);
    if (!record || record.revoked) {
      return null;
    }
    const tenant = this.tenants.get(record.tenantId);
    if (!tenant) {
      return null;
    }
    return { tenant, keyType: record.keyType };
  }

  async getTenantSkill(tenantId: string, skillId: string): Promise<TenantSkill | null> {
    return this.skills.get(`${tenantId}:${skillId}`) ?? null;
  }

  async getUsageSecondsThisPeriod(tenantId: string): Promise<number> {
    return this.usage
      .filter((event) => event.tenantId === tenantId)
      .reduce((total, event) => total + event.seconds, 0);
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    this.usage.push(event);
  }
}
