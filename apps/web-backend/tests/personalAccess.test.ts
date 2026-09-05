import { describe, expect, test } from "bun:test";
import {
  decidePersonalAccess,
  hasCurrentPaidAccess,
  normalizeLegacyTrialSeconds,
  applyTrialUsageSeconds,
  usageBelongsToPaidPeriod,
  isTrustedRelayAdmin,
  PERSONAL_PAID_CAP_SECONDS,
  PERSONAL_TRIAL_SECONDS,
} from "@/domain/personalAccess";

describe("personal access policy", () => {
  test("keeps the existing 900-second trial and 10,800-second paid cap", () => {
    expect(PERSONAL_TRIAL_SECONDS).toBe(900);
    expect(PERSONAL_PAID_CAP_SECONDS).toBe(10_800);
  });

  test("requires a desktop migration marker for an unknown non-paying account", () => {
    expect(decidePersonalAccess({
      source: "relay", status: "none", entitlementType: "relay", periodEnd: null,
      trialSecondsUsed: 0, paidSecondsUsed: 0, migrationState: "unknown", migrationMarkerPresent: false,
    })).toEqual({ allowed: false, status: 409, code: "client_migration_required" });
  });

  test("extension remains paid-only and cannot finalize desktop migration", () => {
    expect(decidePersonalAccess({
      source: "extension", status: "none", entitlementType: "relay", periodEnd: null,
      trialSecondsUsed: 0, paidSecondsUsed: 0, migrationState: "unknown", migrationMarkerPresent: false,
    })).toEqual({ allowed: false, status: 403, code: "subscription_inactive" });
    expect(decidePersonalAccess({
      source: "extension", status: "active", entitlementType: "relay", periodEnd: null,
      trialSecondsUsed: 900, paidSecondsUsed: 0, migrationState: "unknown", migrationMarkerPresent: false,
    })).toMatchObject({ allowed: true, accessMode: "paid" });
  });

  test("past_due is not paid access, while canceled retains only future-period access", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasCurrentPaidAccess("past_due", future)).toBe(false);
    expect(hasCurrentPaidAccess("canceled", future)).toBe(true);
    expect(hasCurrentPaidAccess("canceled", new Date(Date.now() - 60_000).toISOString())).toBe(false);
  });

  test("blocks at the cap and preserves bounded migration values", () => {
    expect(decidePersonalAccess({
      source: "relay", status: "active", entitlementType: "relay", periodEnd: null,
      trialSecondsUsed: 0, paidSecondsUsed: PERSONAL_PAID_CAP_SECONDS, migrationState: "unknown", migrationMarkerPresent: false,
    })).toEqual({ allowed: false, status: 429, code: "cap_reached" });
    expect(normalizeLegacyTrialSeconds("900")).toBe(900);
    expect(normalizeLegacyTrialSeconds("901")).toBeNull();
    expect(normalizeLegacyTrialSeconds("-1")).toBeNull();
  });

  test("trial reports consume migrated floor once and duplicate retries are no-ops", () => {
    const migrated = normalizeLegacyTrialSeconds(600) ?? 0;
    const afterReport = applyTrialUsageSeconds(migrated, 100);
    expect(afterReport).toBe(700);
    expect(PERSONAL_TRIAL_SECONDS - afterReport).toBe(200);
    expect(applyTrialUsageSeconds(afterReport, 100, true)).toBe(700);
  });

  test("paid usage is keyed to the issued period, not a later billing period", () => {
    expect(usageBelongsToPaidPeriod({ accessMode: "paid", sessionPeriodStart: "2026-09-01", eventPeriodStart: "2026-09-01" })).toBe(true);
    expect(usageBelongsToPaidPeriod({ accessMode: "paid", sessionPeriodStart: "2026-08-01", eventPeriodStart: "2026-08-01" })).toBe(true);
    expect(usageBelongsToPaidPeriod({ accessMode: "paid", sessionPeriodStart: "2026-08-01", eventPeriodStart: "2026-09-01" })).toBe(false);
    expect(usageBelongsToPaidPeriod({ accessMode: "trial", sessionPeriodStart: null, eventPeriodStart: null })).toBe(false);
  });

  test("admin bypass is relay-only and has no synthetic remaining-seconds value", () => {
    const decision = decidePersonalAccess({
      source: "relay", status: "none", entitlementType: "relay", periodEnd: null,
      trialSecondsUsed: 900, paidSecondsUsed: PERSONAL_PAID_CAP_SECONDS,
      migrationState: "unknown", migrationMarkerPresent: false,
      isTrustedRelayAdmin: true,
    });
    expect(decision).toEqual({ allowed: true, accessMode: "admin", remainingSeconds: null });
    expect(isTrustedRelayAdmin("user_01KP21J3GEVH8AKJ31C59Z1KJQ")).toBe(true);
    expect(decidePersonalAccess({
      source: "extension", status: "none", entitlementType: "relay", periodEnd: null,
      trialSecondsUsed: 0, paidSecondsUsed: 0, migrationState: "unknown", migrationMarkerPresent: false,
      isTrustedRelayAdmin: true,
    })).toEqual({ allowed: false, status: 403, code: "subscription_inactive" });
  });
});
