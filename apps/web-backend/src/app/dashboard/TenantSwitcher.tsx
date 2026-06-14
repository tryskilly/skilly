"use client";

import { useState, useTransition } from "react";
import type { Tenant } from "@/db/repo";
import { switchTenantAction } from "./actions";

/**
 * Super-admin only: switch which tenant the dashboard acts as. Re-issues the
 * signed session scoped to the chosen tenant (role stays super_admin). Hidden
 * from tenant_admins — they only ever see their own tenant.
 */
export function TenantSwitcher({
  tenants,
  currentTenantId,
}: {
  tenants: Tenant[];
  currentTenantId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextTenantId = event.target.value;
    if (!nextTenantId || nextTenantId === currentTenantId) {
      return;
    }
    const formData = new FormData();
    formData.set("tenantId", nextTenantId);
    startTransition(async () => {
      await switchTenantAction(formData);
      setOpen(false);
    });
  }

  const current = tenants.find((tenant) => tenant.id === currentTenantId);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <strong className="block truncate text-sm">{current?.name ?? "Workspace"}</strong>
          <span className="text-xs text-neutral-500">Acting as this tenant</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-400 transition hover:text-neutral-200"
        >
          {open ? "Close" : "Switch"}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <select
            defaultValue={currentTenantId}
            onChange={onChange}
            disabled={pending}
            className="w-full rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80 disabled:opacity-50"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          {pending && <p className="mt-2 text-xs text-neutral-500">Switching…</p>}
        </div>
      )}
    </div>
  );
}
