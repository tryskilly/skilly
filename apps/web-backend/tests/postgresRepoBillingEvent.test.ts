import { describe, expect, test } from "bun:test";
import { PostgresRepo } from "../src/db/postgresRepo";

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> };

class FakeBillingPool {
  readonly calls: string[] = [];
  readonly events = new Set<string>();
  readonly tenants = new Map<string, { capSeconds: number; customerId: string | null }>();
  failNextUpdate = true;
  releaseCount = 0;

  async connect() {
    const pool = this;
    const transactionEvents = new Set(pool.events);
    let rolledBack = false;
    return {
      query: async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
        pool.calls.push(sql);
        if (sql === "BEGIN") return { rowCount: 0, rows: [] };
        if (sql === "ROLLBACK") {
          rolledBack = true;
          for (const eventId of pool.events) {
            if (!transactionEvents.has(eventId)) pool.events.delete(eventId);
          }
          return { rowCount: 0, rows: [] };
        }
        if (sql === "COMMIT") {
          if (!rolledBack) {
            for (const eventId of transactionEvents) pool.events.add(eventId);
          }
          return { rowCount: 0, rows: [] };
        }
        if (sql.startsWith("INSERT INTO polar_webhook_events")) {
          const eventId = String(params[0]);
          if (pool.events.has(eventId)) return { rowCount: 0, rows: [] };
          transactionEvents.add(eventId);
          return { rowCount: 1, rows: [] };
        }
        if (sql.startsWith("UPDATE tenants SET usage_cap_seconds")) {
          if (pool.failNextUpdate) {
            pool.failNextUpdate = false;
            throw new Error("simulated tenant update failure");
          }
          const [eventId, capSeconds, customerId, providerEventAt, providerState, tenantId] = params;
          pool.tenants.set(String(tenantId), { capSeconds: Number(capSeconds), customerId: customerId as string | null });
          return { rowCount: providerEventAt || providerState || eventId ? 1 : 0, rows: [] };
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
      release: () => {
        pool.releaseCount += 1;
      },
    };
  }
}

describe("PostgresRepo.applyTenantBillingEvent", () => {
  test("rolls back a failed update so the same event can be retried atomically", async () => {
    const pool = new FakeBillingPool();
    const repo = new PostgresRepo(pool as never);
    const input = {
      eventId: "evt_atomic_1",
      tenantId: "tenant_1",
      capSeconds: 3600,
      polarCustomerId: "cus_1",
      providerEventAt: "2026-09-06T00:00:00.000Z",
      providerState: "active",
    };

    await expect(repo.applyTenantBillingEvent(input)).rejects.toThrow("simulated tenant update failure");
    expect(pool.calls.slice(0, 4)).toEqual(["BEGIN", expect.stringContaining("INSERT INTO polar_webhook_events"), expect.stringContaining("UPDATE tenants SET usage_cap_seconds"), "ROLLBACK"]);
    expect(pool.events.has(input.eventId)).toBe(false);
    expect(pool.releaseCount).toBe(1);

    await expect(repo.applyTenantBillingEvent(input)).resolves.toEqual({ replay: false, applied: true });
    expect(pool.events.has(input.eventId)).toBe(true);
    expect(pool.tenants.get(input.tenantId)).toEqual({ capSeconds: 3600, customerId: "cus_1" });
    expect(pool.calls.slice(-4)).toEqual(["BEGIN", expect.stringContaining("INSERT INTO polar_webhook_events"), expect.stringContaining("UPDATE tenants SET usage_cap_seconds"), "COMMIT"]);
    expect(pool.releaseCount).toBe(2);
  });

  test("returns replay without mutating tenant state for a previously committed event", async () => {
    const pool = new FakeBillingPool();
    pool.failNextUpdate = false;
    const repo = new PostgresRepo(pool as never);
    const input = { eventId: "evt_replay", tenantId: "tenant_2", capSeconds: 120, providerState: "active" };

    await expect(repo.applyTenantBillingEvent(input)).resolves.toEqual({ replay: false, applied: true });
    const callsBeforeReplay = pool.calls.length;
    const stateBeforeReplay = pool.tenants.get(input.tenantId);
    await expect(repo.applyTenantBillingEvent({ ...input, capSeconds: 999 })).resolves.toEqual({ replay: true, applied: false });
    expect(pool.tenants.get(input.tenantId)).toEqual(stateBeforeReplay);
    expect(pool.calls.slice(callsBeforeReplay)).toEqual(["BEGIN", expect.stringContaining("INSERT INTO polar_webhook_events"), "ROLLBACK"]);
  });
});
