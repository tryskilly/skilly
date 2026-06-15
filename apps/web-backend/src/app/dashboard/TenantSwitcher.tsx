"use client";

import { useState, useTransition } from "react";
import type { Tenant } from "@/db/repo";
import { switchTenantAction } from "./actions";
import { Select } from "./v2";

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
          <Select
            label="Switch to"
            defaultValue={currentTenantId}
            onChange={onChange}
            disabled={pending}
            options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))}
          />
          {pending && <p className="mt-2 text-xs text-neutral-500">Switching…</p>}
        </div>
      )}
    </div>
  );
}
