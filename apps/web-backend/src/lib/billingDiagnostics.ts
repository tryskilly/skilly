import { captureServerEvent } from "./analytics";

export type BillingFailureReason =
  | "billing_not_configured"
  | "provider_non_2xx"
  | "provider_network_error"
  | "provider_invalid_json"
  | "provider_missing_url"
  | "provider_invalid_url";

/**
 * Emits an operationally useful, secret-free billing diagnostic. This console record is
 * intentionally independent from analytics suppression/transport and contains no provider body,
 * token, email, or URL.
 */
export function logBillingFailure(input: {
  surface: "builder_checkout" | "builder_portal" | "mac_checkout";
  status?: number | null;
  reason: BillingFailureReason;
}): void {
  const status = typeof input.status === "number" && Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
    ? input.status
    : null;
  const record = { surface: input.surface, status, reason: input.reason };
  console.error(`[billing] ${JSON.stringify(record)}`);
  void captureServerEvent("billing_operational_failure", record);
}
