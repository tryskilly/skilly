import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  authorizeHostedAccess,
  InvalidUsageSessionError,
  recordMacUsage,
  upsertMacEntitlement,
} from "../src/lib/macSession";

const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("POSTGRES_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
const future = "2099-09-01T00:00:00.000Z";
const nextPeriod = "2099-10-01T00:00:00.000Z";

async function countEvents(userId: string, eventId?: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM mac_usage_events WHERE user_id = $1 ${eventId ? "AND event_id = $2" : ""}`,
    eventId ? [userId, eventId] : [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  await pool.query("TRUNCATE mac_usage_events, mac_access_sessions, mac_entitlements");

  const admin = await authorizeHostedAccess({ userId: "user_01KP21J3GEVH8AKJ31C59Z1KJQ", email: "admin@example.com", source: "relay" });
  assert.equal(admin.allowed, true);
  if (!admin.allowed) throw new Error("built-in relay admin was blocked");
  assert.equal(admin.accessMode, "admin");
  assert.equal(admin.remainingSeconds, null);
  await recordMacUsage({ userId: "user_01KP21J3GEVH8AKJ31C59Z1KJQ", email: "admin@example.com", source: "relay", sessionId: admin.sessionId, eventId: "admin-event", seconds: 999 });
  const adminExtension = await authorizeHostedAccess({ userId: "user_01KP21J3GEVH8AKJ31C59Z1KJQ", email: "admin@example.com", source: "extension" });
  assert.deepEqual(adminExtension, { allowed: false, status: 403, code: "subscription_inactive" });
  process.env.SKILLY_ADMIN_WORKOS_USER_IDS = "user_config_admin";
  const configuredAdmin = await authorizeHostedAccess({ userId: "user_config_admin", email: "configured@example.com", source: "relay" });
  assert.equal(configuredAdmin.allowed, true);
  if (!configuredAdmin.allowed) throw new Error("configured relay admin was blocked");
  assert.equal(configuredAdmin.accessMode, "admin");
  const spoofedRole = await authorizeHostedAccess({ userId: "user_dashboard_role_only", email: "role@example.com", source: "relay" });
  assert.deepEqual(spoofedRole, { allowed: false, status: 409, code: "client_migration_required" });
  delete process.env.SKILLY_ADMIN_WORKOS_USER_IDS;

  const trial = await authorizeHostedAccess({
    userId: "pg_trial",
    email: "trial@example.com",
    source: "relay",
    migrationMarker: "v1",
    legacyTrialSecondsUsed: 600,
  });
  assert.equal(trial.allowed, true);
  if (!trial.allowed) throw new Error("trial preflight unexpectedly blocked");
  assert.equal(trial.remainingSeconds, 300);
  const firstReport = await recordMacUsage({
    userId: "pg_trial",
    email: "trial@example.com",
    source: "relay",
    sessionId: trial.sessionId,
    eventId: "trial-event-1",
    seconds: 100,
  });
  assert.deepEqual(firstReport, { duplicate: false, recordedSeconds: 100 });
  const afterReport = await authorizeHostedAccess({ userId: "pg_trial", email: "trial@example.com", source: "relay" });
  assert.equal(afterReport.allowed, true);
  if (!afterReport.allowed) throw new Error("trial should still have time");
  assert.equal(afterReport.remainingSeconds, 200);
  assert.deepEqual(
    await recordMacUsage({ userId: "pg_trial", email: "trial@example.com", source: "relay", sessionId: trial.sessionId, eventId: "trial-event-1", seconds: 100 }),
    { duplicate: true, recordedSeconds: 0 },
  );
  const afterDuplicate = await authorizeHostedAccess({ userId: "pg_trial", email: "trial@example.com", source: "relay" });
  assert.equal(afterDuplicate.allowed, true);
  if (!afterDuplicate.allowed) throw new Error("duplicate report blocked trial");
  assert.equal(afterDuplicate.remainingSeconds, 200);

  const concurrent = await authorizeHostedAccess({ userId: "pg_concurrent", email: "concurrent@example.com", source: "relay", migrationMarker: "v1", legacyTrialSecondsUsed: 0 });
  assert.equal(concurrent.allowed, true);
  if (!concurrent.allowed) throw new Error("concurrent fixture blocked");
  const reports = await Promise.all([
    recordMacUsage({ userId: "pg_concurrent", email: "concurrent@example.com", source: "relay", sessionId: concurrent.sessionId, eventId: "same-event", seconds: 25 }),
    recordMacUsage({ userId: "pg_concurrent", email: "concurrent@example.com", source: "relay", sessionId: concurrent.sessionId, eventId: "same-event", seconds: 25 }),
  ]);
  assert.equal(reports.filter((value) => !value.duplicate).length, 1);
  assert.equal(await countEvents("pg_concurrent", "same-event"), 1);

  await assert.rejects(
    recordMacUsage({ userId: "pg_other", email: "other@example.com", source: "relay", sessionId: concurrent.sessionId, eventId: "other-event", seconds: 1 }),
    (error: unknown) => error instanceof InvalidUsageSessionError,
  );
  await assert.rejects(
    recordMacUsage({ userId: "pg_concurrent", email: "concurrent@example.com", source: "relay", sessionId: "missing-session", eventId: "missing-event", seconds: 1 }),
    (error: unknown) => error instanceof InvalidUsageSessionError,
  );

  await upsertMacEntitlement({ userId: "pg_period", email: "period@example.com", status: "active", entitlementType: "relay", periodStart: future, periodEnd: nextPeriod, providerEventAt: "2099-08-01T00:00:00Z", providerEventId: "period-active" });
  const oldSession = await authorizeHostedAccess({ userId: "pg_period", email: "period@example.com", source: "relay" });
  assert.equal(oldSession.allowed, true);
  if (!oldSession.allowed) throw new Error("old paid session blocked");
  await upsertMacEntitlement({ userId: "pg_period", email: "period@example.com", status: "active", entitlementType: "relay", periodStart: nextPeriod, periodEnd: "2099-11-01T00:00:00Z", providerEventAt: "2099-09-01T00:00:00Z", providerEventId: "period-next" });
  await recordMacUsage({ userId: "pg_period", email: "period@example.com", source: "relay", sessionId: oldSession.sessionId, eventId: "old-period-event", seconds: 300 });
  const currentSession = await authorizeHostedAccess({ userId: "pg_period", email: "period@example.com", source: "relay" });
  assert.equal(currentSession.allowed, true);
  if (!currentSession.allowed) throw new Error("new paid period blocked");
  assert.equal(currentSession.remainingSeconds, 10_800);

  await upsertMacEntitlement({ userId: "pg_order", email: "order@example.com", status: "active", entitlementType: "relay", periodStart: future, periodEnd: nextPeriod, providerEventAt: "2099-08-02T00:00:00Z", providerEventId: "order-active" });
  await upsertMacEntitlement({ userId: "pg_order", email: "order@example.com", status: "past_due", entitlementType: "relay", periodStart: future, periodEnd: nextPeriod, providerEventAt: "2099-08-03T00:00:00Z", providerEventId: "order-past-due" });
  await upsertMacEntitlement({ userId: "pg_order", email: "order@example.com", status: "active", entitlementType: "relay", periodStart: future, periodEnd: nextPeriod, providerEventAt: "2099-08-01T00:00:00Z", providerEventId: "order-stale-active" });
  const pastDue = await pool.query<{ status: string }>("SELECT status FROM mac_entitlements WHERE user_id = 'pg_order'");
  assert.equal(pastDue.rows[0]?.status, "past_due");
  await upsertMacEntitlement({ userId: "pg_order", email: "order@example.com", status: "active", entitlementType: "byok", periodStart: future, periodEnd: nextPeriod, providerEventAt: "2099-08-04T00:00:00Z", providerEventId: "order-byok-new" });
  await upsertMacEntitlement({ userId: "pg_order", email: "order@example.com", status: "past_due", entitlementType: "relay", periodStart: future, periodEnd: nextPeriod, providerEventAt: "2099-08-03T00:00:00Z", providerEventId: "order-stale-personal" });
  const byok = await pool.query<{ status: string; entitlement_type: string }>("SELECT status, entitlement_type FROM mac_entitlements WHERE user_id = 'pg_order'");
  assert.deepEqual(byok.rows[0], { status: "active", entitlement_type: "byok" });

  await upsertMacEntitlement({ userId: "pg_bad_period", email: "bad@example.com", status: "active", entitlementType: "relay", periodStart: null, periodEnd: null, providerEventAt: "2099-08-01T00:00:00Z", providerEventId: "bad-period" });
  await assert.rejects(authorizeHostedAccess({ userId: "pg_bad_period", email: "bad@example.com", source: "relay" }), /Canonical billing period/);

  console.log("personal access PostgreSQL integration scenarios passed");
}

await main().finally(() => pool.end());
