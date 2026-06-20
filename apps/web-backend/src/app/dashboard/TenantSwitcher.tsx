"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextTenantId = event.target.value;
    if (!nextTenantId || nextTenantId === currentTenantId) {
      return;
    }
    const formData = new FormData();
    formData.set("tenantId", nextTenantId);
    startTransition(async () => {
      await switchTenantAction(formData);
      router.replace("/dashboard");
      router.refresh();
    });
  }

  const current = tenants.find((tenant) => tenant.id === currentTenantId);

  return (
    <div className="min-w-[240px] rounded-[12px] border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2">
      <label className="grid gap-1">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-amber-300">
          Active workspace
        </span>
        <select
          value={current?.id ?? currentTenantId}
          onChange={onChange}
          disabled={pending}
          aria-label="Active workspace"
          className="w-full rounded-[8px] border border-white/10 bg-gray-950/75 px-2.5 py-1.5 text-sm font-bold text-gray-100 outline-none transition focus:border-amber-500/55 focus:ring-[3px] focus:ring-amber-500/12 disabled:opacity-50"
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-1 text-[11px] text-gray-500">
        {pending ? "Switching workspace…" : "All pages use this workspace."}
      </div>
    </div>
  );
}
