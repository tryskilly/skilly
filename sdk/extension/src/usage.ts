import type { UsageReportMessage } from "./messages";

export interface ExtensionUsageReport {
  accountId: string;
  eventId: string;
  sessionId: string;
  seconds: number;
  result: UsageReportMessage["result"];
  model: string;
  actionsExecuted: number;
  actionsRefused: number;
}

export interface UsageStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface PendingUsage {
  accountId: string;
  report: Omit<ExtensionUsageReport, "accountId">;
}

export type UsageDelivery = "confirmed" | "permanent_invalid" | "deferred";

const OUTBOX_KEY = "pendingUsageReports";
export const MAX_PENDING_REPORTS = 256;

/** Persist before sending so a service-worker teardown cannot lose a completed session report. */
export async function enqueueExtensionUsage(storage: UsageStorage, report: ExtensionUsageReport): Promise<boolean> {
  const pending = await readPending(storage);
  if (pending.length >= MAX_PENDING_REPORTS) return false;
  pending.push({ accountId: report.accountId, report: withoutAccount(report) });
  await storage.set({ [OUTBOX_KEY]: pending });
  return true;
}

/** Return whether a completed session can still be durably recorded without evicting history. */
export async function hasUsageOutboxCapacity(storage: UsageStorage): Promise<boolean> {
  return (await readPending(storage)).length < MAX_PENDING_REPORTS;
}

/** Flush this account's pending history, then gate creation of a new hosted session on capacity. */
export async function prepareUsageOutboxForSession(
  storage: UsageStorage,
  backendUrl: string,
  sessionToken: string,
  accountId: string,
  fetchImpl: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  await flushExtensionUsageOutbox(storage, backendUrl, sessionToken, accountId, fetchImpl);
  return hasUsageOutboxCapacity(storage);
}

/**
 * Flush only entries belonging to the currently authenticated account. A different user's token
 * can therefore never submit an older account's queued usage. Confirmed 2xx and permanent-invalid
 * 4xx reports are removed; authentication, rate-limit, network, and 5xx failures stay queued for a
 * later authenticated opportunity. The queue has a fixed 256-entry ceiling; callers surface a
 * full queue instead of silently dropping accounting.
 */
export async function flushExtensionUsageOutbox(
  storage: UsageStorage,
  backendUrl: string,
  sessionToken: string,
  accountId: string,
  fetchImpl: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  const pending = await readPending(storage);
  const remaining: PendingUsage[] = [];
  for (const item of pending) {
    if (item.accountId !== accountId) {
      remaining.push(item);
      continue;
    }
    const delivery = await deliverExtensionUsage(backendUrl, sessionToken, { ...item.report, accountId }, fetchImpl);
    if (delivery === "deferred") remaining.push(item);
  }
  await storage.set({ [OUTBOX_KEY]: remaining });
}

/** Deliver one report with bounded retries, retaining the exact event id on every attempt. */
export async function deliverExtensionUsage(
  backendUrl: string,
  sessionToken: string,
  report: ExtensionUsageReport,
  fetchImpl: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response> = fetch,
): Promise<UsageDelivery> {
  const url = `${backendUrl.replace(/\/$/, "")}/api/extension/usage`;
  const body = JSON.stringify({
    eventId: report.eventId,
    sessionId: report.sessionId,
    seconds: report.seconds,
    result: report.result,
    model: report.model,
    actionsExecuted: report.actionsExecuted,
    actionsRefused: report.actionsRefused,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
        body,
      });
      if (response.ok) return "confirmed";
      // 401 can become valid again after re-authentication; other client errors indicate a
      // malformed/stale report that retrying would never repair.
      if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429) {
        return "permanent_invalid";
      }
    } catch {
      // Retry network errors; telemetry must not surface an error in the page experience.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  return "deferred";
}

function withoutAccount(report: ExtensionUsageReport): Omit<ExtensionUsageReport, "accountId"> {
  const { accountId: _accountId, ...rest } = report;
  return rest;
}

async function readPending(storage: UsageStorage): Promise<PendingUsage[]> {
  const value = (await storage.get([OUTBOX_KEY]))[OUTBOX_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isPendingUsage);
}

function isPendingUsage(value: unknown): value is PendingUsage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as { accountId?: unknown; report?: unknown };
  if (typeof item.accountId !== "string" || !item.accountId || typeof item.report !== "object" || item.report === null) {
    return false;
  }
  const report = item.report as Partial<ExtensionUsageReport>;
  return (
    typeof report.eventId === "string" &&
    typeof report.sessionId === "string" &&
    typeof report.seconds === "number" &&
    typeof report.result === "string" &&
    typeof report.model === "string" &&
    typeof report.actionsExecuted === "number" &&
    typeof report.actionsRefused === "number"
  );
}
