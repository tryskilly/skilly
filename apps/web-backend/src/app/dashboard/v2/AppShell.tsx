"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  Library,
  Menu,
  MonitorPlay,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import type { DashboardRole } from "@/lib/dashboardAuth";
import type { Tenant } from "@/db/repo";
import { LogoMark } from "./LogoMark";
import { StatusPill } from "./primitives";
import { AccountChip } from "./AccountChip";
import { Footer } from "./Footer";
import { TenantSwitcher } from "../TenantSwitcher";

type ProductSurface = "builder" | "people";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRole?: "super_admin";
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const builderSetupItems: NavItem[] = [
  { href: "/dashboard/setup#teach", label: "Teach", icon: ScrollText },
  { href: "/dashboard/setup#style", label: "Style", icon: Sparkles },
  { href: "/dashboard/setup#allow", label: "Allow", icon: Globe },
  { href: "/dashboard/setup#install", label: "Install", icon: BookOpen },
  { href: "/dashboard/setup#test", label: "Test", icon: MonitorPlay },
];

const builderGroups: NavGroup[] = [
  {
    label: "Set up",
    items: builderSetupItems,
  },
  {
    label: "Run",
    items: [
      { href: "/dashboard/projects", label: "Projects", icon: Library },
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Keys",
    items: [{ href: "/dashboard/keys", label: "API Keys", icon: KeyRound }],
  },
  {
    label: "Platform",
    items: [{ href: "/dashboard/admin/tenants", label: "Tenant directory", icon: ShieldCheck, requiredRole: "super_admin", badge: "staff" }],
  },
];

const peopleGroups: NavGroup[] = [
  {
    label: "Learn",
    items: [
      { href: "/dashboard/people", label: "Create a skill", icon: Plus },
      { href: "/dashboard/people/skills", label: "My skills", icon: Library },
    ],
  },
  {
    label: "Your Skilly",
    items: [{ href: "/dashboard/people/account", label: "Account", icon: CreditCard }],
  },
];

function isActive(pathname: string, href: string): boolean {
  const normalizedHref = href.split("#")[0] ?? href;
  if (href.includes("#")) {
    return false;
  }
  if (normalizedHref === "/dashboard" || normalizedHref === "/dashboard/people") {
    return pathname === normalizedHref;
  }
  return pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`);
}

function surfaceForPath(pathname: string): ProductSurface {
  return pathname.startsWith("/dashboard/people") ? "people" : "builder";
}

function navGroupsForSurface(surface: ProductSurface): NavGroup[] {
  return surface === "people" ? peopleGroups : builderGroups;
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
  hasPeopleSurface,
}: {
  children: ReactNode;
  tenantName: string;
  role: DashboardRole;
  accountEmail: string | null;
  needsSetup: boolean;
  switchableTenants: Tenant[];
  currentTenantId: string;
  readinessCompleted: number;
  readinessTotal: number;
  usedSecondsThisMonth: number;
  usageCapSeconds: number;
  hasPeopleSurface: boolean;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const surface = hasPeopleSurface ? surfaceForPath(pathname) : "builder";
  const visibleGroups = navGroupsForSurface(surface)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.requiredRole || item.requiredRole === role),
    }))
    .filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const current = visibleItems.find((item) => isActive(pathname, item.href));
  const canSwitchTenants = role === "super_admin" && switchableTenants.length > 1 && surface === "builder";

  const readinessFraction = readinessTotal > 0 ? Math.min(1, readinessCompleted / readinessTotal) : 0;
  const usedMinutes = Math.round(usedSecondsThisMonth / 60);
  const capMinutes = usageCapSeconds > 0 ? Math.round(usageCapSeconds / 60) : 0;
  const setupComplete = readinessCompleted >= readinessTotal;
  const isPeople = surface === "people";
  const currentLabel = pathname === "/dashboard/setup" ? "Set up" : (current?.label ?? (isPeople ? "Create a skill" : "Overview"));

  useEffect(() => {
    function scrollHashInsideDashboard() {
      const hash = window.location.hash.slice(1);
      const shell = document.querySelector<HTMLElement>(".skilly-dashboard-shell");
      const main = document.querySelector<HTMLElement>(".skilly-dashboard-main");
      shell?.scrollTo({ top: 0, left: 0 });
      main?.scrollTo({ top: 0, left: 0 });

      if (!hash) {
        return;
      }

      const scrollPane = document.querySelector<HTMLElement>(".skilly-dashboard-scroll");
      const target = document.getElementById(hash);
      if (!scrollPane || !target) {
        return;
      }

      const scrollRect = scrollPane.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextTop = scrollPane.scrollTop + targetRect.top - scrollRect.top - 24;
      scrollPane.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" });
    }

    const runAfterNativeHashJump = () => {
      window.requestAnimationFrame(() => {
        scrollHashInsideDashboard();
        window.requestAnimationFrame(scrollHashInsideDashboard);
      });
    };

    runAfterNativeHashJump();
    window.addEventListener("hashchange", runAfterNativeHashJump);
    return () => window.removeEventListener("hashchange", runAfterNativeHashJump);
  }, [pathname]);

  return (
    <div className="skilly-dashboard-shell text-gray-200">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-[18px] border-r border-line-soft bg-[rgba(11,10,8,0.9)] p-[14px] backdrop-blur-[20px] lg:flex">
        <div className="flex items-center gap-2.5 border-b border-line-soft pb-3.5 pl-2 pr-2">
          <LogoMark size={30} />
          <div>
            <div className="text-[17px] font-extrabold tracking-[-0.02em] text-gray-100">Skilly</div>
            <div className="text-xs text-muted">{hasPeopleSurface ? "one engine, two doors" : tenantName}</div>
          </div>
        </div>

        {hasPeopleSurface && (
          <div className="grid grid-cols-2 gap-1 rounded-[14px] border border-line bg-white/[0.035] p-1">
            <Link
              href="/dashboard/projects"
              className={`flex h-8 items-center justify-center rounded-[10px] text-[13px] font-bold transition ${
                !isPeople ? "bg-amber-500 text-gray-950" : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
              }`}
            >
              Builders
            </Link>
            <Link
              href="/dashboard/people"
              className={`flex h-8 items-center justify-center rounded-[10px] text-[13px] font-bold transition ${
                isPeople ? "bg-[#f50a87] text-white" : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
              }`}
            >
              People
            </Link>
          </div>
        )}

        <nav aria-label="Primary" className="grid gap-5">
          {visibleGroups.map((group) => (
            <div key={group.label} className="grid gap-1">
              <div className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-500">
                <span>{group.label}</span>
                {group.label === "Set up" && (
                  <span className={setupComplete ? "text-success" : "text-amber-300"}>
                    {readinessCompleted}/{readinessTotal}
                  </span>
                )}
              </div>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const activeAccent = isPeople ? "bg-[#f50a87]" : "bg-amber-400";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-analytics-event="dashboard_nav_clicked"
                    data-analytics-label={item.label}
                    data-analytics-target={item.href}
                    className={`relative flex h-[38px] items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 text-sm transition ${
                      active
                        ? isPeople
                          ? "border-[#f50a87]/20 bg-[#f50a87]/10 text-gray-100"
                          : "border-amber-500/18 bg-amber-500/[0.105] text-gray-100"
                        : "text-gray-400 hover:bg-white/[0.045] hover:text-gray-200"
                    }`}
                  >
                    {active && <span className={`absolute left-0 h-[18px] w-0.5 rounded-full ${activeAccent}`} />}
                    <Icon
                      size={18}
                      className={active ? (isPeople ? "text-[#f50a87]" : "text-amber-400") : "text-gray-400"}
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-gray-500">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto grid gap-3">
          {isPeople ? (
            <div className="rounded-[14px] border border-line bg-white/[0.04] p-3">
              <div className="text-xs text-muted">People library</div>
              <div className="mt-1 text-sm font-bold text-gray-100">Bundled Mac skills</div>
              <div className="mt-1 text-xs leading-relaxed text-gray-500">
                Personal minutes and device sync will appear after the personal account backend is connected.
              </div>
            </div>
          ) : (
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
          )}

          <div className="rounded-[14px] border border-line bg-white/[0.04] p-3">
            <strong className="block truncate text-sm text-gray-100">{isPeople ? "Personal Skilly" : tenantName}</strong>
            <span className="text-xs text-muted">{isPeople ? "Skill library" : "Active workspace"}</span>
            <span className="mt-1 block text-xs text-gray-500">
              {role === "super_admin" ? "Super admin" : "Tenant admin"}
            </span>
          </div>

          <div className="flex items-center gap-3 px-1 text-xs text-muted">
            <Link href="/dashboard/docs" className="transition hover:text-gray-200">
              Docs
            </Link>
            <span className="text-white/15">·</span>
            <Link href="/dashboard/support" className="transition hover:text-gray-200">
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

      <main className="skilly-dashboard-main">
        <header className="skilly-dashboard-topbar sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line-soft bg-[rgba(11,10,8,0.82)] px-4 backdrop-blur-[18px] md:px-7">
          <div className="flex min-w-0 items-center gap-3 text-sm text-gray-300">
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] lg:hidden"
              aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <strong className="font-bold text-gray-100">{currentLabel}</strong>
            {!canSwitchTenants && !isPeople && (
              <span className="hidden max-w-[240px] truncate rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-gray-300 md:inline-flex">
                {tenantName}
              </span>
            )}
            {isPeople && (
              <span className="hidden rounded-full border border-[#f50a87]/25 bg-[#f50a87]/10 px-2.5 py-1 text-xs font-bold text-[#ff8ac5] md:inline-flex">
                Personal
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {canSwitchTenants && (
              <div className="hidden xl:block">
                <TenantSwitcher tenants={switchableTenants} currentTenantId={currentTenantId} />
              </div>
            )}
            {!isPeople && usageCapSeconds > 0 && (
              <StatusPill label={`${usedMinutes} / ${capMinutes} min`} className="hidden sm:inline-flex" />
            )}
            {isPeople && <StatusPill tone="neutral" label="Bundled skills" className="hidden sm:inline-flex" />}
            {!isPeople && needsSetup && (
              <Link
                href="/dashboard/install"
                className="hidden rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25 sm:inline-flex"
              >
                Needs setup
              </Link>
            )}
            <AccountChip email={accountEmail} role={role} />
          </div>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-x-0 top-[var(--spacing-topbar)] z-30 max-h-[calc(100dvh-var(--spacing-topbar))] overflow-y-auto border-b border-line bg-[rgba(11,10,8,0.97)] p-4 shadow-2xl backdrop-blur-[18px] lg:hidden">
            {hasPeopleSurface && (
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-[14px] border border-line bg-white/[0.035] p-1">
                <Link
                  href="/dashboard/projects"
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] font-bold transition ${
                    !isPeople ? "bg-amber-500 text-gray-950" : "text-gray-400"
                  }`}
                >
                  Builders
                </Link>
                <Link
                  href="/dashboard/people"
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] font-bold transition ${
                    isPeople ? "bg-[#f50a87] text-white" : "text-gray-400"
                  }`}
                >
                  People
                </Link>
              </div>
            )}

            <nav aria-label="Mobile primary" className="grid gap-5">
              {visibleGroups.map((group) => (
                <div key={group.label} className="grid gap-1">
                  <div className="px-2 pb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-500">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={`flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-sm font-bold transition ${
                          active
                            ? isPeople
                              ? "bg-[#f50a87]/10 text-gray-100"
                              : "bg-amber-500/[0.105] text-gray-100"
                            : "text-gray-400 hover:bg-white/[0.045] hover:text-gray-200"
                        }`}
                      >
                        <Icon size={18} className={active ? (isPeople ? "text-[#f50a87]" : "text-amber-400") : "text-gray-400"} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        )}

        {canSwitchTenants && (
          <div className="skilly-dashboard-tenantbar border-b border-line-soft bg-[rgba(11,10,8,0.72)] px-4 py-3 backdrop-blur-[18px] xl:hidden">
            <TenantSwitcher tenants={switchableTenants} currentTenantId={currentTenantId} />
          </div>
        )}

        <div className="skilly-dashboard-scroll">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-8 pb-16 md:px-8">
            {children}
          </div>
        </div>
        <Footer />
      </main>
    </div>
  );
}
