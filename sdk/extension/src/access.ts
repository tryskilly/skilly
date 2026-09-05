import type { AccessErrorCode } from "./messages";

export interface ExtensionTokenResponse {
  clientSecret: string;
  expiresAt: number;
  model: string;
  accessMode: "paid";
  remainingSeconds: number;
  sessionId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface AccessFailure {
  code: AccessErrorCode;
  status: number;
}

const ACCESS_CODES = new Set<AccessErrorCode>([
  "subscription_inactive",
  "cap_reached",
  "trial_exhausted",
]);

export function accessFailureFromResponse(status: number, body: unknown): AccessFailure {
  const code = isRecord(body) && typeof body.code === "string" ? body.code : undefined;
  if (code && ACCESS_CODES.has(code as AccessErrorCode)) {
    return { code: code as AccessErrorCode, status };
  }
  if (status === 401) {
    return { code: "authentication_required", status };
  }
  return { code: "backend_unavailable", status };
}

export function isExtensionTokenResponse(body: unknown): body is ExtensionTokenResponse {
  if (!isRecord(body)) return false;
  return (
    typeof body.clientSecret === "string" &&
    body.clientSecret.length > 0 &&
    typeof body.expiresAt === "number" &&
    Number.isFinite(body.expiresAt) &&
    typeof body.model === "string" &&
    body.model.length > 0 &&
    body.accessMode === "paid" &&
    typeof body.remainingSeconds === "number" &&
    Number.isFinite(body.remainingSeconds) &&
    body.remainingSeconds >= 0 &&
    typeof body.sessionId === "string" &&
    body.sessionId.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function accessErrorMessage(code: AccessErrorCode): string {
  switch (code) {
    case "subscription_inactive":
      return "An active Skilly subscription is required to start a session.";
    case "cap_reached":
      return "You've reached this billing period's Skilly usage limit.";
    case "trial_exhausted":
      return "Your Skilly trial is used up. Subscribe to continue.";
    case "authentication_required":
      return "Your Skilly sign-in expired. Sign in again to continue.";
    case "usage_outbox_full":
      return "Skilly is finishing an earlier usage report. Reconnect, then try again.";
    case "backend_unavailable":
      return "Skilly couldn't connect. Try again in a moment.";
  }
}
