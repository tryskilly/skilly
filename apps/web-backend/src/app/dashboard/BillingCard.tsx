"use client";

import { useState } from "react";
import { Button } from "./v2";

/**
 * Plan card (v2). Two flows — both preserved from v1, only the chrome changed:
 * - "Upgrade plan" (no active cap) → POST /api/web/checkout (Polar checkout).
 * - "Manage plan" (active cap) → POST /api/web/portal (Polar customer-portal
 *   session). If the tenant has no stored Polar customer id yet, the portal
 *   route returns { fallback: "checkout" } and we fall back to checkout so the
 *   user is never stuck.
 */
export function BillingCard({ capSeconds }: { capSeconds: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPlan = capSeconds > 0;
  const plan = hasPlan ? `${Math.round(capSeconds / 60)} min / month` : "Free (no paid plan)";

  async function redirectTo(url: string | undefined | null): Promise<boolean> {
    if (url) {
      window.location.href = url;
      return true;
    }
    return false;
  }

  async function startCheckout(): Promise<void> {
    const response = await fetch("/api/web/checkout", { method: "POST" });
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
    </section>
  );
}
