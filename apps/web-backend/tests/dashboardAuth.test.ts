import { afterEach, describe, expect, test } from "bun:test";
import {
  configuredDashboardRole,
  parseDashboardSession,
  serializeDashboardSession,
  verifyDashboardPassword,
  type DashboardSession,
} from "../src/lib/dashboardAuth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function session(overrides: Partial<DashboardSession> = {}): DashboardSession {
  return {
    role: "super_admin",
    tenantId: "11111111-1111-1111-1111-111111111111",
    issuedAt: Date.now(),
    ...overrides,
  };
}

describe("dashboard auth", () => {
  test("verifies the configured dashboard password", () => {
    process.env.SKILLY_DASHBOARD_PASSWORD = "correct-horse";

    expect(verifyDashboardPassword("correct-horse")).toBe(true);
    expect(verifyDashboardPassword("wrong")).toBe(false);
  });

  test("serializes and verifies a signed session", () => {
    process.env.SKILLY_DASHBOARD_SESSION_SECRET = "session-secret";

    const raw = serializeDashboardSession(session({ role: "tenant_admin" }));
    const parsed = parseDashboardSession(raw);

    expect(parsed?.role).toBe("tenant_admin");
    expect(parsed?.tenantId).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("preserves optional WorkOS identity fields in signed sessions", () => {
    process.env.SKILLY_DASHBOARD_SESSION_SECRET = "session-secret";

    const raw = serializeDashboardSession(
      session({
        workosUserId: "user_123",
        email: "admin@tryskilly.app",
        workosOrganizationId: "org_123",
      }),
    );
    const parsed = parseDashboardSession(raw);

    expect(parsed?.workosUserId).toBe("user_123");
    expect(parsed?.email).toBe("admin@tryskilly.app");
    expect(parsed?.workosOrganizationId).toBe("org_123");
  });

  test("rejects tampered and expired sessions", () => {
    process.env.SKILLY_DASHBOARD_SESSION_SECRET = "session-secret";

    const raw = serializeDashboardSession(session());
    expect(parseDashboardSession(`${raw}tampered`)).toBeNull();

    const expired = serializeDashboardSession(session({ issuedAt: Date.now() - 9 * 60 * 60 * 1000 }));
    expect(parseDashboardSession(expired)).toBeNull();
  });

  test("defaults local sessions to super admin unless configured otherwise", () => {
    delete process.env.SKILLY_DASHBOARD_ROLE;
    expect(configuredDashboardRole()).toBe("super_admin");

    process.env.SKILLY_DASHBOARD_ROLE = "tenant_admin";
    expect(configuredDashboardRole()).toBe("tenant_admin");
  });
});
