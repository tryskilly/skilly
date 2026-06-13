"use client";

import { useState } from "react";

export function BillingCard({ capSeconds }: { capSeconds: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = capSeconds > 0 ? `${Math.round(capSeconds / 60)} min / month` : "Free (no paid plan)";

  async function startUpgrade() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/web/checkout", { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Checkout is unavailable.");
    } catch {
      setError("Couldn't start checkout.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <h2 className="text-xl font-bold tracking-[-0.025em] text-neutral-100">Plan</h2>
      <p className="mt-2 text-lg text-neutral-300">{plan}</p>
      <p className="mt-1 text-sm text-neutral-500">
        Plan limits control token minting for every embedded widget session.
      </p>
      <button
        onClick={startUpgrade}
        disabled={busy}
        data-analytics-event="dashboard_checkout_clicked"
        data-analytics-label={capSeconds > 0 ? "Manage plan" : "Upgrade plan"}
        className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Starting..." : capSeconds > 0 ? "Manage plan" : "Upgrade plan"}
      </button>
      {error && <p className="mt-2 text-sm text-amber-400">{error}</p>}
    </section>
  );
}
