"use client";

import { useBillingRedirect } from "./go-live/useBillingRedirect";
import { Button } from "./v2";

export interface BillingPlanOption {
  id: "starter" | "studio" | "scale";
  name: string;
  priceMonthly: number;
  minutes: number;
  capSeconds: number;
  description: string;
}

/**
 * Plan card (v2). Two flows — both preserved from v1, only the chrome changed:
 * - "Upgrade plan" (no active cap) → POST /api/web/checkout (Polar checkout) with the selected plan.
 * - "Manage plan" (active cap) → POST /api/web/portal (Polar customer-portal
 *   session). If the tenant has no stored Polar customer id yet, the portal
 *   route returns { fallback: "checkout" } and we fall back to checkout so the
 *   user is never stuck.
 */
export function BillingCard({ capSeconds, plans }: { capSeconds: number; plans: BillingPlanOption[] }) {
  const { busy, error, startCheckout, openPortal } = useBillingRedirect();
  const hasPlan = capSeconds > 0;
  const currentPlan = plans.find((candidate) => candidate.capSeconds === capSeconds);
  const plan = hasPlan
    ? currentPlan
      ? `${currentPlan.name} · ${currentPlan.minutes.toLocaleString()} min / month`
      : `${Math.round(capSeconds / 60).toLocaleString()} min / month`
    : "Test mode (no paid plan)";

  function onManageClick(): void {
    if (hasPlan) {
      void openPortal();
    } else {
      void startCheckout();
    }
  }

  return (
    <section className="rounded-[16px] border border-line bg-surface p-[18px] shadow-card">
      <div className="text-[15px] font-bold tracking-[-0.01em] text-fg">Plan</div>
      <div className="mt-1 text-lg text-fg-muted">{plan}</div>
      <p className="mt-1 text-xs text-fg-muted">
        {hasPlan
          ? "Manage your subscription, invoices, and billing details in the Polar portal."
          : "Plan limits control token minting for every embedded widget session."}
      </p>
      <div className="mt-4">
        <Button
          variant="primary"
          disabled={busy}
          analyticsEvent={hasPlan ? "dashboard_portal_clicked" : "dashboard_checkout_clicked"}
          analyticsLabel={hasPlan ? "Manage plan" : "Upgrade plan"}
          onClick={onManageClick}
          type="button"
        >
          {busy ? "Opening…" : hasPlan ? "Manage plan" : "Upgrade plan"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-5 grid gap-3">
        {plans.map((option) => {
          const isCurrent = hasPlan && option.capSeconds === capSeconds;
          return (
            <div
              key={option.id}
              className={`rounded-[14px] border p-4 ${
                isCurrent ? "border-accent-line bg-accent-soft" : "border-line-soft bg-surface-sunken"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-fg">{option.name}</div>
                  <div className="mt-1 text-xs text-fg-muted">{option.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-fg">${option.priceMonthly}</div>
                  <div className="text-xs text-fg-muted">/mo</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-fg-muted">{option.minutes.toLocaleString()} minutes / month</div>
              {!hasPlan && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void startCheckout(option.id); }}
                  className="mt-3 h-10 w-full rounded-[8px] border border-line-soft bg-surface text-sm font-bold text-fg transition hover:bg-surface-strong disabled:opacity-60"
                >
                  {busy ? "Opening…" : `Choose ${option.name}`}
                </button>
              )}
              {isCurrent && <div className="mt-3 text-xs font-bold text-accent-text">Current plan</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
