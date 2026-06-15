"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings as SettingsIcon, ChevronDown } from "lucide-react";
import type { DashboardRole } from "@/lib/dashboardAuth";

/*
 * Account chip for the topbar (the missing user identity affordance).
 * Shows an initials avatar + email + role, with a keyboard-reachable dropdown
 * to reach Settings / Sign out. Per design-system + taste-skill a11y rules:
 * real focus states, Escape-to-close, click-outside-to-close, and the dropdown
 * is a leaf client component so no provider/state leaks into the RSC tree.
 */
function initialsFromEmail(email: string | null | undefined): string {
  if (!email) return "·";
  const handle = email.split("@")[0] ?? email;
  const parts = handle.split(/[.\-_+]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return handle.slice(0, 2).toUpperCase();
}

export function AccountChip({
  email,
  role,
}: {
  email: string | null;
  role: DashboardRole;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const roleLabel = role === "super_admin" ? "Super admin" : "Tenant admin";

  // Click-outside + Escape-to-close (keyboard-reachable per a11y).
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-line bg-white/[0.045] py-1 pl-1 pr-2 text-sm text-gray-200 outline-none transition hover:bg-white/[0.07] focus-visible:ring-[3px] focus-visible:ring-amber-500/40"
      >
        {/* Initials avatar — amber-tinted circle. */}
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-300">
          {initialsFromEmail(email)}
        </span>
        <span className="hidden max-w-[160px] truncate sm:block">{email ?? "Account"}</span>
        <ChevronDown
          size={14}
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 overflow-hidden rounded-[14px] border border-line bg-[#141416] shadow-[0_30px_80px_rgba(0,0,0,0.48)]"
        >
          {/* Identity header */}
          <div className="border-b border-line-soft px-3.5 py-3">
            <div className="truncate text-sm font-bold text-gray-100">{email ?? "Signed in"}</div>
            <div className="mt-0.5 text-xs text-muted">{roleLabel}</div>
          </div>
          {/* Actions */}
          <div className="p-1.5">
            <Link
              href="/dashboard/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-sm text-gray-300 outline-none transition hover:bg-white/[0.06] focus-visible:ring-[3px] focus-visible:ring-amber-500/40"
            >
              <SettingsIcon size={16} className="text-muted" strokeWidth={1.75} />
              Settings
            </Link>
            <form action="/api/dashboard/logout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-sm text-[#fca5a5] outline-none transition hover:bg-error/10 focus-visible:ring-[3px] focus-visible:ring-amber-500/40"
              >
                <LogOut size={16} strokeWidth={1.75} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
