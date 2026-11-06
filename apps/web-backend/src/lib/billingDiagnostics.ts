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
  surface: "builder_checkout" | "builder_portal";
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


/**
 * Records a checkout attempt for the staff follow-up list. Tracking must never stop a customer
 * from paying, so a failure here is logged and swallowed.
 */
/** Cross-surface checkout failure. `reason` is a short code, never a provider body or email. */
export async function captureCheckoutFailed(input: {
  reason: string;
  status?: number;
  sourceSurface: string;
  distinctId?: string;
  plan?: string;
}): Promise<void> {
  await captureServerEvent("checkout_failed", {
    reason: input.reason,
    status: input.status,
    source_surface: input.sourceSurface,
    plan: input.plan,
  }, input.distinctId);
}

export async function recordCheckoutStartedWithoutBlockingPayment(recordCheckoutStarted: () => Promise<void>): Promise<void> {
  try {
    await recordCheckoutStarted();
  } catch (error) {
    console.error(`[billing] checkout_started_record_failed ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`);
  }
}
