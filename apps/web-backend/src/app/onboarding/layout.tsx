import type { ReactNode } from "react";
import Link from "next/link";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { LogoMark } from "../dashboard/v2";

export const dynamic = "force-dynamic";

/**
 * Onboarding shell (spec §5.4): a focused, centered flow with NO dashboard
 * sidebar. A slim top bar carries the brand mark, a 4-step indicator, and a
 * "skip to dashboard" escape hatch. Every step requires a valid dashboard
 * session (the WorkOS signup callback issues one scoped to the new tenant).
 */
const STEPS = [
  { n: 1, label: "Company" },
  { n: 2, label: "Install" },
  { n: 3, label: "Skill" },
  { n: 4, label: "Test" },
];

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireDashboardSession();

  return (
    <div className="min-h-dvh text-gray-200">
      {/* Slim top bar */}
      <header className="flex h-16 items-center justify-between border-b border-line-soft bg-[rgba(15,15,16,0.78)] px-4 backdrop-blur md:px-7">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-sm font-bold tracking-[-0.02em] text-gray-100">Skilly</span>
          <span className="text-xs text-muted">Setup</span>
        </Link>
        <div className="hidden items-center gap-2 sm:flex">
          {STEPS.map((step, index) => (
            <span key={step.n} className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted">
                <span className="text-gray-300">{step.n}</span>. {step.label}
              </span>
              {index < STEPS.length - 1 && <span className="text-white/15">·</span>}
            </span>
          ))}
        </div>
        <Link href="/dashboard" className="text-xs text-muted transition hover:text-gray-200">
          Skip to dashboard →
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14">{children}</main>
    </div>
  );
}
