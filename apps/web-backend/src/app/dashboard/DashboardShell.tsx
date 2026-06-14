"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { DashboardRole } from "@/lib/dashboardAuth";
import type { Tenant } from "@/db/repo";
import { SkillyMark } from "./ui";
import { TenantSwitcher } from "./TenantSwitcher";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/install", label: "Install" },
  { href: "/dashboard/widget", label: "Widget" },
  { href: "/dashboard/skill", label: "Teaching Skill" },
  { href: "/dashboard/origins", label: "Domains" },
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/usage", label: "Usage" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/admin/tenants", label: "Super Admin", requiredRole: "super_admin" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({
  children,
  tenantName,
  role,
  needsSetup,
  switchableTenants,
  currentTenantId,
}: {
  children: ReactNode;
  tenantName: string;
  role: DashboardRole;
  needsSetup: boolean;
  /** Tenants a super_admin can switch into; empty for tenant_admins. */
  switchableTenants: Tenant[];
  currentTenantId: string;
}) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => !item.requiredRole || item.requiredRole === role);
  const current = navItems.find((item) => isActive(pathname, item.href));
  const canSwitchTenants = role === "super_admin" && switchableTenants.length > 1;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_30%_-20%,rgba(245,158,11,0.14),transparent_36%),#0F0F10] text-neutral-100 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-white/10 bg-neutral-950/90 p-4 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:p-5">
        <div className="flex items-center gap-3 border-b border-white/10 pb-5">
          <SkillyMark />
          <div>
            <div className="text-xl font-extrabold tracking-[-0.03em]">Skilly</div>
            <div className="text-xs text-neutral-500">Web control room</div>
          </div>
        </div>

        <nav className="mt-5 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:flex-col">
          {visibleNavItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-analytics-event="dashboard_nav_clicked"
                data-analytics-label={item.label}
                data-analytics-target={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-amber-500/15 text-amber-300"
                    : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-current opacity-75" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 border-t border-white/10 pt-4 lg:mt-auto">
          {canSwitchTenants ? (
            <TenantSwitcher tenants={switchableTenants} currentTenantId={currentTenantId} />
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <strong className="block text-sm">{tenantName}</strong>
              <span className="text-xs text-neutral-500">Tenant workspace · live backend</span>
              <span className="mt-1 block text-xs text-neutral-600">
                {role === "super_admin" ? "Super admin" : "Tenant admin"}
              </span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500 lg:grid lg:gap-2">
            <Link href="/dashboard/install" className="hover:text-neutral-200">
              Docs
            </Link>
            <Link href="/dashboard/settings" className="hover:text-neutral-200">
              Support
            </Link>
            <form action="/api/dashboard/logout" method="post">
              <button type="submit" className="hover:text-neutral-200">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/10 bg-neutral-950/75 px-4 backdrop-blur md:px-8">
          <div className="text-sm text-neutral-400">Dashboard / {current?.label ?? "Overview"}</div>
          <div className="flex items-center gap-3">
            {needsSetup && (
              <Link
                href="/dashboard/install"
                className="hidden rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25 sm:inline-flex"
              >
                Needs setup
              </Link>
            )}
            <Link
              href="/dashboard/widget"
              data-analytics-event="dashboard_widget_test_clicked"
              data-analytics-label="Test widget"
              data-analytics-target="/dashboard/widget"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-600 active:scale-[0.98]"
            >
              Test widget
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-[1360px] px-4 py-8 md:px-8">{children}</div>
      </main>

      <div className="pointer-events-none fixed bottom-5 right-5 hidden md:block">
        <Image
          src="/brand/skilly-cursor.png"
          alt=""
          width={42}
          height={42}
          className="drop-shadow-[0_0_12px_rgba(252,211,77,0.32)]"
        />
      </div>
    </div>
  );
}
