"use client";

import { useState } from "react";

/**
 * Plan card. Two flows:
 * - "Upgrade plan" (no active cap) → POST /api/web/checkout (start a Polar checkout).
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
    <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <h2 className="text-xl font-bold tracking-[-0.025em] text-neutral-100">Plan</h2>
      <p className="mt-2 text-lg text-neutral-300">{plan}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {hasPlan
          ? "Manage your subscription, invoices, and billing details in the Polar portal."
          : "Plan limits control token minting for every embedded widget session."}
      </p>
      <button
        onClick={onManageClick}
        disabled={busy}
        data-analytics-event={hasPlan ? "dashboard_portal_clicked" : "dashboard_checkout_clicked"}
        data-analytics-label={hasPlan ? "Manage plan" : "Upgrade plan"}
        className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Opening..." : hasPlan ? "Manage plan" : "Upgrade plan"}
      </button>
      {error && <p className="mt-2 text-sm text-amber-400">{error}</p>}
    </section>
  );
}
