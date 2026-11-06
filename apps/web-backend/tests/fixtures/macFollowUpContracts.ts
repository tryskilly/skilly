import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRepo } from "../../src/db/memoryRepo";

interface EntitlementFixture {
  user_id: string;
  email: string | null;
  status: string;
  entitlement_type: string;
  plan: string | null;
  period_start: string | null;
  period_end: string | null;
  polar_customer_id: string | null;
  provider_event_at: string | null;
  provider_event_id: string | null;
  provider_event_state: string | null;
  trial_seconds_used: number;
  trial_migration_state: string;
  trial_migrated_at: string | null;
  checkout_started_at: Date | null;
}
const entitlements = new Map<string, EntitlementFixture>();
const usageEvents: { userId: string; source: string | null; seconds: number }[] = [];
const sqlCalls: string[] = [];
const events: { event: string; properties: unknown }[] = [];
const revalidatedPaths: string[] = [];
let cookieValue: string | undefined;
let poolEndCount = 0;
function seed(userId: string, overrides: Partial<EntitlementFixture> = {}): EntitlementFixture {
  const row = {
    user_id: userId, email: `${userId}@example.com`, status: "none", entitlement_type: "relay", plan: null,
    period_start: null, period_end: null, polar_customer_id: "customer_fixture",
    provider_event_at: "2026-09-01T00:00:00.000Z", provider_event_id: "provider_fixture", provider_event_state: "canceled",
    trial_seconds_used: 900, trial_migration_state: "recorded", trial_migrated_at: "2026-09-02T00:00:00.000Z",
    checkout_started_at: new Date("2026-09-03T00:00:00.000Z"), ...overrides,
  };
  entitlements.set(userId, row);
  return row;
}
async function query(sql: string, values: unknown[] = []) {
  sqlCalls.push(sql);
  const userId = String(values[0]);
  let row = entitlements.get(userId);
  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
  if (sql.startsWith("UPDATE mac_entitlements") && sql.includes("END - $2")) {
    assert.match(sql, /GREATEST\(0,\s*CASE WHEN trial_migration_state = 'recorded' THEN trial_seconds_used/);
    assert.match(sql, /ELSE GREATEST\(trial_seconds_used, LEAST\(\$2,/);
    assert.match(sql, /SUM\(CASE WHEN source IS DISTINCT FROM 'byok' THEN seconds ELSE 0 END\)/);
    assert.match(sql, /trial_migration_state = 'recorded'/);
    assert.match(sql, /trial_migrated_at = COALESCE\(trial_migrated_at, now\(\)\)/);
    assert.match(sql, /updated_at = now\(\)/);
    assert.equal(values[1], 900);
    if (!row) return { rows: [], rowCount: 0 };
    const floor = Math.min(900, usageEvents.filter((event) => event.userId === userId && event.source !== "byok")
      .reduce((total, event) => total + event.seconds, 0));
    const baseline = row.trial_migration_state === "recorded" ? row.trial_seconds_used : Math.max(row.trial_seconds_used, floor);
    row.trial_seconds_used = Math.max(0, baseline - 900);
    row.trial_migration_state = "recorded";
    row.trial_migrated_at ??= new Date().toISOString();
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("INSERT INTO mac_entitlements") && sql.includes("'comp'")) {
    assert.match(sql, /VALUES \(\$1, 'active', 'relay', 'comp', \$2, \$3, now\(\)\)/);
    const updateSql = sql.split("DO UPDATE SET")[1];
    assert.ok(updateSql);
    assert.doesNotMatch(updateSql, /polar_customer_id|provider_event_|trial_seconds_used|trial_migration_state/);
    row ??= seed(userId, {
      email: null, polar_customer_id: null, provider_event_at: null, provider_event_id: null, provider_event_state: null,
      trial_seconds_used: 0, trial_migration_state: "unknown", trial_migrated_at: null, checkout_started_at: null,
    });
    row.status = "active";
    row.entitlement_type = "relay";
    row.plan = "comp";
    row.period_start = String(values[1]);
    row.period_end = String(values[2]);
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("INSERT INTO mac_entitlements") && sql.includes("provider_event_at")) {
    assert.match(sql, /WHERE mac_entitlements.provider_event_at IS NULL/);
    assert.match(sql, /EXCLUDED.provider_event_at > mac_entitlements.provider_event_at/);
    if (row && typeof values[8] === "string" && (!row.provider_event_at || values[8] > row.provider_event_at)) {
      row.status = String(values[2]); row.entitlement_type = String(values[3]);
      row.period_start = String(values[4]); row.period_end = String(values[5]); row.plan = String(values[6]);
      row.provider_event_at = values[8]; row.provider_event_id = String(values[9]); row.provider_event_state = String(values[10]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("INSERT INTO mac_entitlements") && sql.includes("DO NOTHING")) return { rows: [], rowCount: 0 };
  if (sql.startsWith("INSERT INTO mac_access_sessions")) return { rows: [], rowCount: 1 };
  if (sql.includes("FROM mac_usage_events")) {
    assert.ok(!sql.includes("IS DISTINCT FROM 'byok'"), "recorded extension never recomputes the migration floor");
    return { rows: [{ total: "0" }], rowCount: 1 };
  }
  if (sql.includes("checkout_started_at IS NOT NULL")) {
    assert.match(sql, /trial_seconds_used, trial_migration_state/);
    return { rows: [...entitlements.values()].filter((record) => record.checkout_started_at && record.status !== "active"), rowCount: 1 };
  }
  if (sql.includes("FROM mac_entitlements")) {
    if (!sql.includes("FOR UPDATE")) assert.match(sql, /trial_seconds_used, trial_migration_state/);
    return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
  }
  throw new Error(`Unexpected SQL ${sql}`);
}
mock.module("pg", () => ({ Pool: class {
  query = query;
  async connect() { return { query, release() {} }; }
  async end() { poolEndCount++; }
} }));
mock.module("next/headers", () => ({ cookies: async () => ({ get: () => cookieValue ? { value: cookieValue } : undefined }) }));
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/dashboard/admin/follow-up", redirect: (path: string): never => { throw new Error(`redirect ${path}`); } }));
mock.module("next/cache", () => ({ revalidatePath: (path: string) => { revalidatedPaths.push(path); } }));
mock.module("../../src/lib/analytics", () => ({ captureServerEvent: async (event: string, properties: unknown) => { events.push({ event, properties }); } }));
process.env.DATABASE_URL = "postgres://fixture.invalid/network-free";
delete process.env.POSTGRES_URL;
process.env.SKILLY_DASHBOARD_SESSION_SECRET = "fixture-secret";
process.env.SESSION_TOKEN_SECRET = "fixture-mac-secret";
globalThis.fetch = Object.assign(async () => { throw new Error("Network calls are forbidden"); }, { preconnect: globalThis.fetch.preconnect });

const { hasCurrentPersonalEntitlement } = await import("../../src/domain/billing");
const { serializeDashboardSession } = await import("../../src/lib/dashboardAuth");
const { extendMacTrialAction, compMacPlanAction } = await import("../../src/app/dashboard/admin/follow-up/actions");
const { getMacEntitlement, listMacCheckoutDropoffs, compMacPlan, authorizeHostedAccess, upsertMacEntitlement } = await import("../../src/lib/macSession");
const formData = (userId: string) => { const form = new FormData(); form.set("userId", userId); return form; };
const recorded = seed("recorded");
const unknown = seed("unknown", { trial_seconds_used: 0, trial_migration_state: "unknown", trial_migrated_at: null });
usageEvents.push({ userId: "unknown", source: "relay", seconds: 500 }, { userId: "unknown", source: null, seconds: 600 }, { userId: "unknown", source: "byok", seconds: 5000 });

for (const role of [null, "tenant_admin"] as const) {
  cookieValue = role ? serializeDashboardSession({ role, tenantId: "tenant_fixture", issuedAt: Date.now() }) : undefined;
  for (const action of [extendMacTrialAction, compMacPlanAction]) await assert.rejects(action(formData("recorded")), /redirect/);
}
assert.equal(sqlCalls.length, 0);
assert.equal(events.length, 0);
assert.equal(revalidatedPaths.length, 0);
cookieValue = serializeDashboardSession({ role: "super_admin", tenantId: "tenant_fixture", issuedAt: Date.now(), email: "staff@example.com" });
await assert.rejects(extendMacTrialAction(new FormData()), /Mac user ID is required/);
await assert.rejects(compMacPlanAction(formData(" ")), /Mac user ID is required/);
assert.equal(sqlCalls.length, 0);

const { default: FollowUpPage } = await import("../../src/app/dashboard/admin/follow-up/page");
const memoryRepo = new MemoryRepo();
globalThis.__skillyRepo = memoryRepo;
const tenantId = (await memoryRepo.createTenant({ name: "Customer workspace" })).id;
await memoryRepo.recordTenantCheckoutStarted(tenantId);
const beforeHtml = renderToStaticMarkup(await FollowUpPage());
assert.ok(beforeHtml.includes("Extend trial +15 min"));
assert.ok(beforeHtml.includes("Give 30 minutes"));
assert.ok(beforeHtml.includes(`href="/dashboard/admin/tenants/${tenantId}"`));
assert.ok(beforeHtml.includes("Manage"));
assert.ok(beforeHtml.includes("0 trial minutes remaining"));
assert.ok(!beforeHtml.includes("15 trial minutes remaining"));
assert.ok(!beforeHtml.includes('role="dialog"'), "actions start behind a confirmation gate");

const callsBeforeExtend = sqlCalls.length;
await extendMacTrialAction(formData("recorded"));
assert.equal(sqlCalls.length, callsBeforeExtend + 1, "extension is one SQL statement");
assert.equal(recorded.trial_seconds_used, 0);
assert.equal(recorded.trial_migrated_at, "2026-09-02T00:00:00.000Z");
await extendMacTrialAction(formData("unknown"));
assert.equal(unknown.trial_seconds_used, 0);
assert.equal(unknown.trial_migration_state, "recorded");
assert.ok(unknown.trial_migrated_at);
assert.ok(renderToStaticMarkup(await FollowUpPage()).includes("15 trial minutes remaining"));
const extendedAccess = await authorizeHostedAccess({ userId: "unknown", email: "unknown@example.com", source: "relay" });
assert.ok(extendedAccess.allowed);
assert.equal(extendedAccess.accessMode, "trial");
assert.equal(extendedAccess.remainingSeconds, 900);
const providerMetadataBefore = [recorded.polar_customer_id, recorded.provider_event_at, recorded.provider_event_id, recorded.provider_event_state];
const beforeComp = Date.now();
await compMacPlanAction(formData("recorded"));
assert.equal(recorded.status, "active");
assert.equal(recorded.entitlement_type, "relay");
assert.equal(recorded.plan, "comp");
assert.equal(hasCurrentPersonalEntitlement(recorded), true);
assert.ok(recorded.period_start && recorded.period_end);
// The Mac app's period_start parser rejects fractional seconds.
assert.match(String(recorded.period_start), /T\d{2}:\d{2}:\d{2}Z$/);
assert.ok(Date.parse(recorded.period_start) >= beforeComp - 1000 && Date.parse(recorded.period_start) <= Date.now());
assert.equal(Date.parse(recorded.period_end) - Date.parse(recorded.period_start), 30 * 24 * 60 * 60 * 1000);
assert.deepEqual([recorded.polar_customer_id, recorded.provider_event_at, recorded.provider_event_id, recorded.provider_event_state], providerMetadataBefore);
assert.ok(!(await listMacCheckoutDropoffs()).some((record) => record.userId === "recorded"));
assert.ok(!renderToStaticMarkup(await FollowUpPage()).includes("recorded@example.com"));
const paidAccess = await authorizeHostedAccess({ userId: "recorded", email: "recorded@example.com", source: "relay" });
assert.ok(paidAccess.allowed);
assert.equal(paidAccess.accessMode, "paid");
assert.equal(paidAccess.remainingSeconds, 1_800); // comp = 30 free minutes, not the 3-hour paid cap
recorded.period_end = new Date(Date.now() - 1000).toISOString();
recorded.trial_seconds_used = 900;
assert.equal(hasCurrentPersonalEntitlement(recorded), false);
assert.deepEqual(await authorizeHostedAccess({ userId: "recorded", email: "recorded@example.com", source: "relay" }), { allowed: false, status: 403, code: "trial_exhausted" });
await compMacPlan("new_customer");
assert.equal(entitlements.get("new_customer")?.status, "active");
assert.equal(entitlements.get("new_customer")?.provider_event_at, null);
await upsertMacEntitlement({ userId: "recorded", status: "active", entitlementType: "relay", plan: "relay", periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z", providerEventAt: "2026-10-01T00:00:00.000Z", providerEventId: "later_provider" });
assert.equal(recorded.plan, "relay");
assert.equal(recorded.provider_event_id, "later_provider");
assert.equal(recorded.polar_customer_id, "customer_fixture");
assert.deepEqual(events.filter(({ event }) => event.startsWith("staff_")), [
  { event: "staff_mac_trial_extended", properties: { workos_user_id: "recorded", extended_seconds: 900, staff_email: "staff@example.com" } },
  { event: "staff_mac_trial_extended", properties: { workos_user_id: "unknown", extended_seconds: 900, staff_email: "staff@example.com" } },
  { event: "staff_mac_plan_comped", properties: { workos_user_id: "recorded", days: 30, minutes: 30, staff_email: "staff@example.com" } },
]);
assert.deepEqual(revalidatedPaths, Array(3).fill("/dashboard/admin/follow-up"));
await assert.rejects(extendMacTrialAction(formData("missing")), /Mac entitlement was not found/);
assert.equal(events.length, 3, "a missing row produces no success event");
assert.equal(revalidatedPaths.length, 3);
assert.ok(poolEndCount > 0);

const { NextRequest } = await import("next/server");
const { GET } = await import("../../src/app/api/mac/entitlement/route");
function request(userId: string, queryUserId?: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, email: `${userId}@example.com`, iat: now, exp: now + 60, iss: "skilly-studio", aud: "skilly-desktop" })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", "fixture-mac-secret").update(input).digest("base64url");
  return new NextRequest(`https://studio.example/api/mac/entitlement${queryUserId ? `?user_id=${queryUserId}` : ""}`, { headers: { authorization: `Bearer ${input}.${signature}` } });
}
assert.equal((await GET(new NextRequest("https://studio.example/api/mac/entitlement"))).status, 401);
assert.equal((await GET(request("recorded", "other_user"))).status, 403);
assert.deepEqual(await (await GET(request("absent"))).json(), {
  user_id: "absent", status: "none", entitlement_type: null, period_start: null, period_end: null, plan: null, polar_customer_id: null, trial_seconds_used: null,
});
const unmigrated = seed("unmigrated", { trial_seconds_used: 450, trial_migration_state: "unknown" });
assert.equal((await (await GET(request(unmigrated.user_id))).json()).trial_seconds_used, null);
assert.equal((await (await GET(request("unknown"))).json()).trial_seconds_used, 0);
unknown.trial_seconds_used = 120;
assert.equal((await getMacEntitlement("unknown"))?.trial_seconds_used, 120);
const recordedResponse = await (await GET(request("unknown"))).json();
assert.equal(recordedResponse.trial_seconds_used, 120);
assert.ok(!("trial_migration_state" in recordedResponse));
assert.ok(!("trial_migrated_at" in recordedResponse));
assert.ok(!("provider_event_at" in recordedResponse));
console.log("Mac follow-up contracts passed. Staff authorization, atomic trial SQL, comp periods, provider ordering, hosted access, entitlement JSON, and rendered rows verified without network.");
