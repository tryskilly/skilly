// In-memory repo for local dev (no DATABASE_URL) and unit tests. Seeded with one
// demo tenant whose publishable key + skill let the @skilly/web demo connect.

import { randomUUID } from "node:crypto";
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

interface SeededKey {
  id: string;
  keyHash: string;
  keyType: KeyType;
  tenantId: string;
  prefix: string;
  last4: string;
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
        allowedAppIds: ["com.acme.demo", "app.tryskilly.demo"],
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
      const display = keyDisplay(key.rawKey);
      this.keys.set(keyHash, {
        id: randomUUID(),
        keyHash,
        keyType: key.keyType,
        tenantId: key.tenantId,
        prefix: display.prefix,
        last4: display.last4,
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

  async listTenants(): Promise<Tenant[]> {
    return [...this.tenants.values()];
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async listApiKeys(tenantId: string): Promise<ApiKeyInfo[]> {
    return [...this.keys.values()]
      .filter((record) => record.tenantId === tenantId)
      .map((record) => ({
        id: record.id,
        keyType: record.keyType,
        prefix: record.prefix,
        last4: record.last4,
        revoked: record.revoked,
      }));
  }

  async createApiKey(tenantId: string, keyType: KeyType): Promise<{ rawKey: string; info: ApiKeyInfo }> {
    const rawKey = generateKey(keyType);
    const keyHash = hashKey(rawKey);
    const display = keyDisplay(rawKey);
    const record: SeededKey = {
      id: randomUUID(),
      keyHash,
      keyType,
      tenantId,
      prefix: display.prefix,
      last4: display.last4,
      revoked: false,
    };
    this.keys.set(keyHash, record);
    return {
      rawKey,
      info: { id: record.id, keyType, prefix: record.prefix, last4: record.last4, revoked: false },
    };
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<void> {
    for (const record of this.keys.values()) {
      if (record.tenantId === tenantId && record.id === keyId) {
        record.revoked = true;
      }
    }
  }

  async saveTenantSkill(tenantId: string, skillId: string, content: string): Promise<void> {
    this.skills.set(`${tenantId}:${skillId}`, { tenantId, skillId, content });
  }

  async getUsageSummary(tenantId: string): Promise<UsageSummary> {
    const tenant = this.tenants.get(tenantId);
    return {
      usageSecondsThisPeriod: await this.getUsageSecondsThisPeriod(tenantId),
      capSeconds: tenant?.usageCapSeconds ?? 0,
    };
  }

  async setTenantUsageCap(tenantId: string, capSeconds: number): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      tenant.usageCapSeconds = capSeconds;
    }
  }

  async setTenantOrigins(tenantId: string, origins: string[]): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      tenant.allowedOrigins = origins;
    }
  }

  async setTenantAppIds(tenantId: string, appIds: string[]): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      tenant.allowedAppIds = appIds;
    }
  }
}
