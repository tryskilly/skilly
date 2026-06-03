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
    <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Plan</h2>
      <p className="mt-2 text-lg">{plan}</p>
      <button
        onClick={startUpgrade}
        disabled={busy}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? "Starting…" : capSeconds > 0 ? "Manage plan" : "Upgrade plan"}
      </button>
      {error && <p className="mt-2 text-sm text-amber-400">{error}</p>}
    </section>
  );
}
