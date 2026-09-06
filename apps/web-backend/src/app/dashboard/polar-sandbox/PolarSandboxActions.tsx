"use client";

import { useState } from "react";

export function PolarSandboxActions() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function checkout(product: "builder-starter" | "mac") {
    setBusy(product); setError(null);
    try {
      const response = await fetch("/api/dashboard/polar-sandbox/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product }) });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Checkout unavailable");
      window.location.assign(data.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Checkout unavailable"); }
    finally { setBusy(null); }
  }
  async function openPortal() {
    setBusy("portal"); setError(null);
    try {
      const response = await fetch("/api/dashboard/polar-sandbox/portal", { method: "POST" });
      const data = await response.json() as { portal_url?: string; error?: string };
      if (!response.ok || !data.portal_url) throw new Error(data.error ?? "Portal unavailable");
      window.location.assign(data.portal_url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Portal unavailable"); }
    finally { setBusy(null); }
  }
  return <div className="flex flex-wrap gap-3">
    <button type="button" disabled={Boolean(busy)} onClick={() => checkout("builder-starter")} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black">{busy === "builder-starter" ? "Opening…" : "B2B Starter sandbox checkout"}</button>
    <button type="button" disabled={Boolean(busy)} onClick={() => checkout("mac")} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-gray-100">{busy === "mac" ? "Opening…" : "B2C Mac sandbox checkout"}</button>
    <button type="button" disabled={Boolean(busy)} onClick={openPortal} className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-bold text-amber-300">{busy === "portal" ? "Opening…" : "B2C Mac sandbox portal"}</button>
    {error && <p className="basis-full text-sm text-red-300">{error}</p>}
  </div>;
}
