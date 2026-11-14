import type { ReactNode } from "react";
import Link from "next/link";
import { getRepo } from "@/db";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { AccountChip, LogoMark, StatusPill } from "@/app/dashboard/v2";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const session = await requireDashboardSession();
  const tenant = await getRepo().getTenant(session.tenantId);
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold"><LogoMark size={26} />Skilly Studio</Link>
          <span className="text-fg-subtle" aria-hidden="true">/</span>
          <span className="text-sm font-semibold">{tenant?.name ?? "Your workspace"}</span>
          {tenant?.usageCapSeconds === 0 && <StatusPill tone="amber" label="Test mode" />}
        </div>
        <div className="flex items-center gap-4"><Link href="/dashboard/support" className="text-xs text-fg-muted hover:text-fg">Help</Link><AccountChip email={session.email ?? null} role={session.role} /></div>
      </header>
      <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}
