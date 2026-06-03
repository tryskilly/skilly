// Per-tenant usage quota. The web analog of the desktop UsageTracker cap: a
// tenant has a monthly cap in seconds (0 = unlimited), and we block new token
// mints once the period's usage reaches it. Pure + deterministic, mirroring the
// spirit of the shared Rust policy engine (core/policy).

export interface QuotaInput {
  usageSecondsThisPeriod: number;
  capSeconds: number;
}

export function isUnlimited(capSeconds: number): boolean {
  return capSeconds <= 0;
}

export function isOverQuota(input: QuotaInput): boolean {
  if (isUnlimited(input.capSeconds)) {
    return false;
  }
  return input.usageSecondsThisPeriod >= input.capSeconds;
}

export function remainingSeconds(input: QuotaInput): number {
  if (isUnlimited(input.capSeconds)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, input.capSeconds - input.usageSecondsThisPeriod);
}
