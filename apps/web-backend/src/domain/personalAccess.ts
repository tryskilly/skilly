export const PERSONAL_TRIAL_SECONDS = 900;
export const PERSONAL_PAID_CAP_SECONDS = 10_800;

export type PersonalAccessSource = "relay" | "extension";
export type PersonalAccessMode = "trial" | "paid";
export type PersonalEntitlementStatus = "active" | "canceled" | "past_due" | "none" | "revoked" | "expired";
export type PersonalAccessBlockCode =
  | "client_migration_required"
  | "trial_exhausted"
  | "subscription_inactive"
  | "cap_reached";

export interface PersonalAccessDecisionInput {
  source: PersonalAccessSource;
  status: PersonalEntitlementStatus;
  entitlementType?: string | null;
  periodEnd?: string | null;
  trialSecondsUsed: number;
  paidSecondsUsed: number;
  migrationState: "unknown" | "recorded";
  migrationMarkerPresent: boolean;
}

export type PersonalAccessDecision = {
  allowed: true;
  accessMode: PersonalAccessMode;
  remainingSeconds: number;
} | {
  allowed: false;
  status: 403 | 409 | 429;
  code: PersonalAccessBlockCode;
};

export function hasCurrentPaidAccess(
  status: PersonalEntitlementStatus,
  periodEnd?: string | null,
  now = Date.now(),
): boolean {
  if (status === "active") {
    return !periodEnd || Number.isNaN(Date.parse(periodEnd)) || Date.parse(periodEnd) > now;
  }
  if (status !== "canceled") {
    return false;
  }
  const parsedEnd = periodEnd ? Date.parse(periodEnd) : Number.NaN;
  return Number.isFinite(parsedEnd) && parsedEnd > now;
}

export function decidePersonalAccess(input: PersonalAccessDecisionInput): PersonalAccessDecision {
  const paid = input.entitlementType !== "byok" && hasCurrentPaidAccess(input.status, input.periodEnd);
  if (paid) {
    if (input.paidSecondsUsed >= PERSONAL_PAID_CAP_SECONDS) {
      return { allowed: false, status: 429, code: "cap_reached" };
    }
    return {
      allowed: true,
      accessMode: "paid",
      remainingSeconds: Math.max(0, PERSONAL_PAID_CAP_SECONDS - input.paidSecondsUsed),
    };
  }

  // The extension has never offered the desktop lifetime trial. Keeping this paid-only avoids
  // an extension-first login finalizing a trial baseline for an old desktop account.
  if (input.source === "extension") {
    return { allowed: false, status: 403, code: "subscription_inactive" };
  }

  if (input.migrationState === "unknown" && !input.migrationMarkerPresent) {
    return { allowed: false, status: 409, code: "client_migration_required" };
  }
  if (input.trialSecondsUsed >= PERSONAL_TRIAL_SECONDS) {
    return { allowed: false, status: 403, code: "trial_exhausted" };
  }
  return {
    allowed: true,
    accessMode: "trial",
    remainingSeconds: Math.max(0, PERSONAL_TRIAL_SECONDS - input.trialSecondsUsed),
  };
}

export function normalizeLegacyTrialSeconds(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > PERSONAL_TRIAL_SECONDS) return null;
  return parsed;
}

/** Deterministic counterpart of the SQL LEAST update used for a new trial usage event. */
export function applyTrialUsageSeconds(current: number, seconds: number, duplicate = false): number {
  if (duplicate) return Math.max(0, Math.round(current));
  return Math.min(PERSONAL_TRIAL_SECONDS, Math.max(0, Math.round(current)) + Math.max(0, Math.round(seconds)));
}

/** New usage rows are charged to the period captured when their server session was issued. */
export function usageBelongsToPaidPeriod(input: {
  accessMode: string | null;
  sessionPeriodStart: string | null;
  eventPeriodStart: string | null;
}): boolean {
  return input.accessMode === "paid" && input.sessionPeriodStart === input.eventPeriodStart;
}
