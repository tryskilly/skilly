"use client";

import { useState, type ReactNode } from "react";
import type { BillingPlanOption } from "../BillingCard";
import { Button, Panel, PanelBody, StatusPill } from "../v2";
import { StepBadge } from "./StepBadge";
import { useBillingRedirect } from "./useBillingRedirect";

export function GoLivePlans({ capSeconds, plans, children }: {
  capSeconds: number;
  plans: BillingPlanOption[];
  children: ReactNode;
}) {
  const recommendedPlan = plans[1] ?? plans[0];
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanOption["id"] | "free">(recommendedPlan?.id ?? "free");
  const { busy, error, startCheckout, openPortal } = useBillingRedirect();
  const hasPaidPlan = capSeconds > 0;
  const currentPlan = plans.find((plan) => plan.capSeconds === capSeconds);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);

  return (
    <>
      <Panel>
        <PanelBody className="space-y-4 p-5 sm:p-6">
          {hasPaidPlan ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StepBadge step={3} done />
                <h2 className="text-base font-bold text-fg">On {currentPlan?.name ?? `${Math.round(capSeconds / 60).toLocaleString()} min / month`}</h2>
              </div>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => { void openPortal(); }}
                analyticsEvent="dashboard_portal_clicked" analyticsLabel="Manage plan">
                {busy ? "Opening…" : "Manage plan"}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <StepBadge step={3} />
                <h2 className="text-base font-bold text-fg">Pick a plan to turn Skilly on for visitors</h2>
              </div>
              <p className="text-sm text-fg-muted">Test mode covers your own testing. A plan sets how many minutes your visitors can talk to Skilly each month.</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Choose your plan">
                <button type="button" role="radio" aria-checked={selectedPlanId === "free"} disabled={busy}
                  onClick={() => setSelectedPlanId("free")}
                  className={`rounded-[12px] border p-4 text-left transition ${selectedPlanId === "free" ? "border-accent-line bg-accent-soft ring-1 ring-accent" : "border-line bg-surface-sunken hover:bg-surface-strong"}`}>
                  <span className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-fg">Test mode</span><StatusPill label="Current" /></span>
                  <span className="mt-3 block text-3xl font-bold tracking-tight text-fg">$0</span>
                  <span className="mt-3 block text-xs leading-5 text-fg-muted">Test mode only. Visitors can&apos;t see Skilly.</span>
                </button>
                {plans.map((plan) => (
                  <button key={plan.id} type="button" role="radio" aria-checked={selectedPlanId === plan.id} disabled={busy}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-[12px] border p-4 text-left transition ${selectedPlanId === plan.id ? "border-accent-line bg-accent-soft ring-1 ring-accent" : "border-line bg-surface-sunken hover:bg-surface-strong"}`}>
                    <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-fg">{plan.name}</span>{plan.id === recommendedPlan?.id && <StatusPill tone="amber" label="Recommended" className="h-5 px-1.5 text-[10px]" />}</span>
                    <span className="mt-3 block text-3xl font-bold tracking-tight text-fg">${plan.priceMonthly}<span className="ml-1 text-xs font-normal text-fg-muted">/mo</span></span>
                    <span className="mt-3 block font-mono text-xs text-fg-muted">{plan.minutes.toLocaleString()} visitor min / mo</span>
                    <span className="mt-2 block text-xs leading-5 text-fg-muted">{plan.description}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {hasPaidPlan && error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </PanelBody>
      </Panel>
      {children}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-5">
        <p className="text-xs text-fg-muted">You&apos;ll go live as soon as the script is detected and the plan is active.</p>
        {!hasPaidPlan && (
          <div className="flex flex-col items-end gap-2">
            <Button type="button" variant={selectedPlan ? "primary" : "secondary"} disabled={busy || !selectedPlan}
              className="h-12 px-5" analyticsEvent="dashboard_checkout_clicked" analyticsLabel={selectedPlan ? `Go live with ${selectedPlan.name}` : "Stay in test mode"}
              onClick={() => { if (selectedPlan) void startCheckout(selectedPlan.id); }}>
              {busy ? "Opening…" : selectedPlan ? `Go live with ${selectedPlan.name} · $${selectedPlan.priceMonthly}/mo` : "Stay in test mode"}
            </Button>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </footer>
    </>
  );
}
