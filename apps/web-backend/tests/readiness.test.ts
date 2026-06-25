import { afterEach, describe, expect, test } from "bun:test";
import { getReadinessStatus } from "../src/lib/readiness";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("readiness", () => {
  test("passes in local memory mode with the default dashboard auth", async () => {
    delete process.env.DATABASE_URL;
    Object.assign(process.env, { NODE_ENV: "development" });

    const status = await getReadinessStatus();

    expect(status.ok).toBe(true);
    expect(status.checks.dashboardAuth.configured).toBe(true);
    expect(status.checks.database.mode).toBe("memory");
    expect(status.checks.database.reachable).toBe(true);
    expect(status.checks.database.seededTenant).toBe(true);
  });

  test("fails in production when dashboard auth is not configured", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.SKILLY_DASHBOARD_PASSWORD;
    delete process.env.SKILLY_DASHBOARD_SESSION_SECRET;
    Object.assign(process.env, { NODE_ENV: "production" });

    const status = await getReadinessStatus();

    expect(status.ok).toBe(false);
    expect(status.checks.dashboardAuth.configured).toBe(false);
  });
});
