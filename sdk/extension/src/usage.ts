import type { UsageReportMessage } from "./messages";

export interface ExtensionUsageReport {
  eventId: string;
  sessionId: string;
  seconds: number;
  result: UsageReportMessage["result"];
  model: string;
  actionsExecuted: number;
  actionsRefused: number;
}

/**
 * Report one session with bounded retries. eventId is supplied by the host and never regenerated,
 * so a retry cannot double-count a usage event. 4xx responses are permanent client errors and are
 * not retried; transient failures remain best-effort so they never interrupt page assistance.
 */
export async function reportExtensionUsage(
  backendUrl: string,
  sessionToken: string,
  report: ExtensionUsageReport,
  fetchImpl: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  const url = `${backendUrl.replace(/\/$/, "")}/api/extension/usage`;
  const body = JSON.stringify({
    eventId: report.eventId,
    sessionId: report.sessionId,
    seconds: report.seconds,
    result: report.result,
    model: report.model,
    actionsExecuted: report.actionsExecuted,
    actionsRefused: report.actionsRefused,
    tokens: {},
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
        body,
      });
      if (response.ok) return true;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) return false;
    } catch {
      // Retry network errors; the report is telemetry and must not surface a page error.
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return false;
}
