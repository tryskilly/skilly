"use client";

import { useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPlan = capSeconds > 0;
  const currentPlan = plans.find((candidate) => candidate.capSeconds === capSeconds);
  const plan = hasPlan
    ? currentPlan
      ? `${currentPlan.name} · ${currentPlan.minutes.toLocaleString()} min / month`
      : `${Math.round(capSeconds / 60).toLocaleString()} min / month`
    : "Free (no paid plan)";

  async function redirectTo(url: string | undefined | null): Promise<boolean> {
    if (url) {
      window.location.href = url;
      return true;
    }
    return false;
  }

  async function startCheckout(planId = "starter"): Promise<void> {
    const response = await fetch("/api/web/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const data = (await response.json()) as { url?: string; error?: string };
    if (await redirectTo(data.url)) {
      return;
    }
    throw new Error(data.error ?? "Checkout is unavailable.");
  }

  async function openPortal(): Promise<void> {
    const response = await fetch("/api/web/portal", { method: "POST" });
    const data = (await response.json()) as { url?: string; error?: string; fallback?: string };
    if (await redirectTo(data.url)) {
      return;
    }
    // No subscription on record yet → fall back to starting a checkout.
    if (data.fallback === "checkout") {
      await startCheckout();
      return;
    }
    throw new Error(data.error ?? "The customer portal is unavailable.");
  }

  async function onManageClick(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (hasPlan) {
        await openPortal();
      } else {
        await startCheckout();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-[16px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.058),rgba(255,255,255,0.034))] p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="text-[15px] font-bold tracking-[-0.01em] text-gray-100">Plan</div>
      <div className="mt-1 text-lg text-gray-300">{plan}</div>
      <p className="mt-1 text-xs text-muted">
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
      {error && <p className="mt-2 text-xs text-[#fca5a5]">{error}</p>}
      <div className="mt-5 grid gap-3">
        {plans.map((option) => {
          const isCurrent = hasPlan && option.capSeconds === capSeconds;
          return (
            <div
              key={option.id}
              className={`rounded-[14px] border p-4 ${
                isCurrent ? "border-amber-500/45 bg-amber-500/10" : "border-line-soft bg-black/15"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-gray-100">{option.name}</div>
                  <div className="mt-1 text-xs text-muted">{option.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-100">${option.priceMonthly}</div>
                  <div className="text-xs text-muted">/mo</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-300">{option.minutes.toLocaleString()} minutes / month</div>
              {!hasPlan && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void startCheckout(option.id)
                      .catch((error) => setError(error instanceof Error ? error.message : "Something went wrong."))
                      .finally(() => setBusy(false));
                  }}
                  className="mt-3 h-10 w-full rounded-[8px] border border-line-soft bg-white/[0.06] text-sm font-bold text-gray-100 transition hover:bg-white/[0.1] disabled:opacity-60"
                >
                  {busy ? "Opening…" : `Choose ${option.name}`}
                </button>
              )}
              {isCurrent && <div className="mt-3 text-xs font-bold text-amber-300">Current plan</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
