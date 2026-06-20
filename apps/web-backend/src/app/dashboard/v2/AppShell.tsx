"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  KeyRound,
  Globe,
  LayoutDashboard,
  CreditCard,
  ScrollText,
  BookOpen,
  Settings,
  Sparkles,
  BarChart3,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { DashboardRole } from "@/lib/dashboardAuth";
import type { Tenant } from "@/db/repo";
import { LogoMark } from "./LogoMark";
import { StatusPill } from "./primitives";
import { AccountChip } from "./AccountChip";
import { Footer } from "./Footer";
import { TenantSwitcher } from "../TenantSwitcher";

/*
 * Skilly Web v2 app shell (spec §3 app shell, prototype .app-shell/.sidebar/
 * .topbar). Three zones: persistent sidebar (brand, product nav with Lucide
 * icons, readiness mini-panel, docs/support/signout), sticky topbar
 * (breadcrumb + Live/Test pill + usage mini meter + Test-widget CTA), and the
 * content canvas. Replaces DashboardShell. Preserves all v1 wiring: pathname-
 * based active state, role-gated nav, super-admin tenant switcher, needs-setup
 * badge, and the logout form posting to /api/dashboard/logout.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRole?: "super_admin";
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/install", label: "Install", icon: BookOpen },
  { href: "/dashboard/widget", label: "Widget", icon: Sparkles },
  { href: "/dashboard/skill", label: "Teaching Skill", icon: ScrollText },
  { href: "/dashboard/origins", label: "Domains", icon: Globe },
  { href: "/dashboard/keys", label: "API Keys", icon: KeyRound },
  { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/admin/tenants", label: "Super Admin", icon: ShieldCheck, requiredRole: "super_admin" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  tenantName,
  role,
  accountEmail,
  needsSetup,
  switchableTenants,
  currentTenantId,
  readinessCompleted,
  readinessTotal,
  usedSecondsThisMonth,
  usageCapSeconds,
}: {
  children: ReactNode;
  tenantName: string;
  role: DashboardRole;
  accountEmail: string | null;
  needsSetup: boolean;
  switchableTenants: Tenant[];
  currentTenantId: string;
  /** Readiness for the sidebar mini-panel (0..total). */
  readinessCompleted: number;
  readinessTotal: number;
  /** Usage for the topbar mini meter (seconds this month + cap). */
  usedSecondsThisMonth: number;
  usageCapSeconds: number;
}) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => !item.requiredRole || item.requiredRole === role);
  const current = navItems.find((item) => isActive(pathname, item.href));
  const canSwitchTenants = role === "super_admin" && switchableTenants.length > 1;

  // Sidebar readiness mini-panel: fraction complete + segmented dots.
  const readinessFraction = readinessTotal > 0 ? Math.min(1, readinessCompleted / readinessTotal) : 0;
  const usedMinutes = Math.round(usedSecondsThisMonth / 60);
  const capMinutes = usageCapSeconds > 0 ? Math.round(usageCapSeconds / 60) : 0;

  return (
    <div className="min-h-dvh text-gray-200 lg:grid lg:grid-cols-[var(--spacing-sidebar)_1fr]">
      {/* ---------- Sidebar ---------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-[18px] border-r border-line-soft bg-[rgba(15,15,16,0.86)] p-[14px] backdrop-blur-[20px] lg:flex">
        {/* Brand / workspace */}
        <div className="flex items-center gap-2.5 border-b border-line-soft pb-3.5 pl-2 pr-2">
          <LogoMark size={30} />
          <div>
            <div className="text-[17px] font-extrabold tracking-[-0.02em] text-gray-100">Skilly</div>
            <div className="text-xs text-muted">{tenantName}</div>
          </div>
        </div>

        {/* Product nav */}
        <nav aria-label="Primary" className="grid gap-1">
          <div className="px-2.5 pb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-500">
            Control room
          </div>
          {visibleNavItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-analytics-event="dashboard_nav_clicked"
                data-analytics-label={item.label}
                data-analytics-target={item.href}
                className={`relative flex h-[38px] items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 text-sm transition ${
                  active
                    ? "border-amber-500/18 bg-amber-500/[0.105] text-gray-100"
                    : "text-gray-400 hover:bg-white/[0.045] hover:text-gray-200"
                }`}
              >
                {active && (
                  <span className="absolute left-0 h-[18px] w-0.5 rounded-full bg-amber-400" />
                )}
                <Icon
                  size={18}
                  className={active ? "text-amber-400" : "text-gray-400"}
                  strokeWidth={1.75}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Readiness mini-panel + workspace/account at the bottom */}
        <div className="mt-auto grid gap-3">
          <div className="rounded-[14px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-3">
            <div className="text-xs text-muted">Readiness</div>
            <div className="mt-2.5 h-[7px] overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-amber-300),var(--color-amber-500))]"
                style={{ width: `${readinessFraction * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <strong className="text-gray-200">
                {readinessCompleted}/{readinessTotal} checks
              </strong>
              <StatusPill
                tone={needsSetup ? "amber" : "green"}
                label={needsSetup ? "Setup" : "Configured"}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-line bg-white/[0.04] p-3">
            <strong className="block truncate text-sm text-gray-100">{tenantName}</strong>
            <span className="text-xs text-muted">Active workspace</span>
            <span className="mt-1 block text-xs text-gray-500">
              {role === "super_admin" ? "Super admin" : "Tenant admin"}
            </span>
          </div>

          <div className="flex items-center gap-3 px-1 text-xs text-muted">
            <Link href="/dashboard/install" className="transition hover:text-gray-200">
              Docs
            </Link>
            <span className="text-white/15">·</span>
            <Link href="/dashboard/settings" className="transition hover:text-gray-200">
              Support
            </Link>
            <span className="text-white/15">·</span>
            <form action="/api/dashboard/logout" method="post">
              <button type="submit" className="transition hover:text-gray-200">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] items-center justify-between gap-4 border-b border-line-soft bg-[rgba(15,15,16,0.78)] px-4 backdrop-blur-[18px] md:px-7">
          <div className="flex min-w-0 items-center gap-3 text-sm text-gray-300">
            <strong className="font-bold text-gray-100">{current?.label ?? "Overview"}</strong>
            {!canSwitchTenants && (
              <span className="hidden max-w-[240px] truncate rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-gray-300 md:inline-flex">
                {tenantName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {canSwitchTenants && (
              <div className="hidden xl:block">
                <TenantSwitcher tenants={switchableTenants} currentTenantId={currentTenantId} />
              </div>
            )}
            {usageCapSeconds > 0 && (
              <StatusPill label={`${usedMinutes} / ${capMinutes} min`} />
            )}
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
              className="inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-white/12 bg-amber-500 px-[13px] text-sm font-bold text-gray-950 shadow-[0_10px_24px_rgba(245,158,11,0.16)] transition hover:bg-amber-600 active:scale-[0.98]"
            >
              Test widget
            </Link>
            <AccountChip email={accountEmail} role={role} />
          </div>
        </header>

        {canSwitchTenants && (
          <div className="border-b border-line-soft bg-[rgba(15,15,16,0.72)] px-4 py-3 backdrop-blur-[18px] xl:hidden">
            <TenantSwitcher tenants={switchableTenants} currentTenantId={currentTenantId} />
          </div>
        )}

        {/* Content canvas */}
        <div className="mx-auto w-[min(1280px,calc(100vw-var(--spacing-sidebar)-56px))] px-4 py-8 pb-16 md:px-8">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
