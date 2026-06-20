// In-memory repo for local dev (no DATABASE_URL) and unit tests. Seeded with one
// demo tenant whose publishable key + skill let the @skilly/web demo connect.

import { randomUUID } from "node:crypto";
import { generateKey, hashKey, keyDisplay, type KeyType } from "../domain/keys";
import type {
  ApiKeyInfo,
  DashboardMembership,
  DashboardMembershipInput,
  DashboardMembershipLookup,
  KeyLookup,
  RecentSession,
  Tenant,
  TenantSkill,
  UsageDimensions,
  UsageEvent,
  UsageMetrics,
  UsageSummary,
  WebBackendRepo,
  WidgetConfig,
} from "./repo";
import { DEFAULT_WIDGET_CONFIG } from "./repo";

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
  memberships?: DashboardMembership[];
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
        polarCustomerId: null,
      },
    ],
    keys: [{ rawKey: DEMO_PUBLISHABLE_KEY, keyType: "publishable", tenantId }],
    memberships: [
      {
        workosUserId: "user_01KP21J3GEVH8AKJ31C59Z1KJQ",
        tenantId,
        role: "super_admin",
        email: "admin@tryskilly.app",
        workosOrganizationId: null,
      },
    ],
    skills: [
      {
        tenantId,
        skillId: "default",
        content: "# Acme Onboarding\n\nGuide the user through setting up their first project.",
      },
    ],
  };
}

export class MemoryRepo implements WebBackendRepo {
  private tenants = new Map<string, Tenant>();
  private keys = new Map<string, SeededKey>();
  private skills = new Map<string, TenantSkill>();
  private memberships: DashboardMembership[] = [];
  // Monotonic insertion counter so newest-first ordering is stable even when
  // many events are recorded within the same millisecond (mirrors Postgres
  // BIGSERIAL + ORDER BY created_at DESC).
  private usageSequence = 0;
  private usage: Array<UsageEvent & UsageDimensions & { createdAt: Date; sequence: number }> = [];
  private widgetConfigs = new Map<string, WidgetConfig>();

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
    this.memberships = [...(seed.memberships ?? [])];
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

  async listTenantSkills(tenantId: string): Promise<TenantSkill[]> {
    return [...this.skills.values()]
      .filter((skill) => skill.tenantId === tenantId)
      .sort((left, right) => left.skillId.localeCompare(right.skillId));
  }

  async getUsageSecondsThisPeriod(tenantId: string): Promise<number> {
    return this.usage
      .filter((event) => event.tenantId === tenantId)
      .reduce((total, event) => total + event.seconds, 0);
  }

  async recordUsage(event: UsageEvent & UsageDimensions): Promise<void> {
    this.usage.push({
      ...event,
      page: event.page ?? null,
      domain: event.domain ?? null,
      durationSeconds: event.durationSeconds ?? null,
      result: event.result ?? null,
      createdAt: new Date(),
      sequence: this.usageSequence++,
    });
  }

  async listUsageEvents(
    tenantId: string,
    limit: number,
  ): Promise<Array<UsageEvent & { createdAt: Date }>> {
    return this.usage
      .filter((event) => event.tenantId === tenantId)
      .slice()
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, limit)
      .map(({ sequence: _sequence, page: _page, domain: _domain, durationSeconds: _durationSeconds, result: _result, ...event }) => event);
  }

  async listRecentSessions(tenantId: string, limit: number): Promise<RecentSession[]> {
    return this.usage
      .filter((event) => event.tenantId === tenantId && event.kind === "session_seconds")
      .slice()
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, limit)
      .map((event) => ({
        createdAt: event.createdAt,
        seconds: event.seconds,
        page: event.page,
        domain: event.domain,
        durationSeconds: event.durationSeconds,
        result: event.result,
      }));
  }

  async getUsageMetrics(tenantId: string): Promise<UsageMetrics> {
    const sessions = this.usage.filter(
      (event) => event.tenantId === tenantId && event.kind === "session_seconds",
    );
    const sessionCount = sessions.length;
    if (sessionCount === 0) {
      return { sessionCount: 0, avgSessionSeconds: 0, errorRate: 0 };
    }
    const totalSeconds = sessions.reduce((total, event) => total + event.seconds, 0);
    const errorCount = sessions.filter(
      (event) => event.result === "error" || event.result === "mic_denied",
    ).length;
    return {
      sessionCount,
      avgSessionSeconds: Math.round(totalSeconds / sessionCount),
      errorRate: errorCount / sessionCount,
    };
  }

  async getTopPages(
    tenantId: string,
    limit: number,
  ): Promise<Array<{ page: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const event of this.usage) {
      if (event.tenantId === tenantId && event.kind === "session_seconds" && event.page) {
        counts.set(event.page, (counts.get(event.page) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getTopDomains(
    tenantId: string,
    limit: number,
  ): Promise<Array<{ domain: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const event of this.usage) {
      if (event.tenantId === tenantId && event.kind === "session_seconds" && event.domain) {
        counts.set(event.domain, (counts.get(event.domain) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async listTenants(): Promise<Tenant[]> {
    return [...this.tenants.values()];
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async createTenant(input: {
    name: string;
    allowedOrigins?: string[];
    allowedAppIds?: string[];
    usageCapSeconds?: number;
  }): Promise<Tenant> {
    const tenant: Tenant = {
      id: randomUUID(),
      name: input.name,
      allowedOrigins: input.allowedOrigins ?? [],
      allowedAppIds: input.allowedAppIds ?? [],
      usageCapSeconds: input.usageCapSeconds ?? 0,
      polarCustomerId: null,
    };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async updateTenantName(tenantId: string, name: string): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      tenant.name = name;
    }
  }

  async findDashboardMembership(lookup: DashboardMembershipLookup): Promise<DashboardMembership | null> {
    const memberships = this.memberships.filter((membership) => membership.workosUserId === lookup.workosUserId);
    if (lookup.workosOrganizationId) {
      const organizationMatch = memberships.find(
        (membership) => membership.workosOrganizationId === lookup.workosOrganizationId,
      );
      if (organizationMatch) {
        return organizationMatch;
      }
    }
    return memberships[0] ?? null;
  }

  async upsertDashboardMembership(input: DashboardMembershipInput): Promise<DashboardMembership> {
    const existing = this.memberships.find(
      (membership) => membership.workosUserId === input.workosUserId && membership.tenantId === input.tenantId,
    );
    const membership: DashboardMembership = {
      workosUserId: input.workosUserId,
      tenantId: input.tenantId,
      role: input.role,
      email: input.email ?? null,
      workosOrganizationId: input.workosOrganizationId ?? null,
    };

    if (existing) {
      Object.assign(existing, membership);
      return existing;
    }

    this.memberships.push(membership);
    return membership;
  }

  async listDashboardMemberships(tenantId: string): Promise<DashboardMembership[]> {
    return this.memberships.filter((membership) => membership.tenantId === tenantId);
  }

  async deleteDashboardMembership(
    tenantId: string,
    workosUserId: string,
  ): Promise<{ removed: boolean; reason?: "last_super_admin" | "not_found" }> {
    const tenantMemberships = this.memberships.filter(
      (membership) => membership.tenantId === tenantId,
    );
    const target = tenantMemberships.find(
      (membership) => membership.workosUserId === workosUserId,
    );
    if (!target) {
      return { removed: false, reason: "not_found" };
    }
    // Refuse to remove the last super_admin of a tenant — that would orphan it.
    const otherSuperAdmins = tenantMemberships.filter(
      (membership) =>
        membership.role === "super_admin" && membership.workosUserId !== workosUserId,
    );
    if (target.role === "super_admin" && otherSuperAdmins.length === 0) {
      return { removed: false, reason: "last_super_admin" };
    }
    this.memberships = this.memberships.filter(
      (membership) =>
        !(membership.tenantId === tenantId && membership.workosUserId === workosUserId),
    );
    return { removed: true };
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

  async setTenantPolarCustomerId(tenantId: string, polarCustomerId: string): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      tenant.polarCustomerId = polarCustomerId;
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

  async getWidgetConfig(tenantId: string): Promise<WidgetConfig> {
    return this.widgetConfigs.get(tenantId) ?? { ...DEFAULT_WIDGET_CONFIG };
  }

  async saveWidgetConfig(tenantId: string, config: WidgetConfig): Promise<void> {
    this.widgetConfigs.set(tenantId, { ...config });
  }
}
