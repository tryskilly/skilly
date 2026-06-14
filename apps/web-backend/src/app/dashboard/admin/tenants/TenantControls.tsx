"use client";

import { useState } from "react";
import { renameTenantAction, setTenantCapAction } from "../../actions";
import { FormButton } from "../../ui";

/**
 * Per-tenant super-admin controls rendered inside each directory row:
 * adjust the monthly usage cap and rename the workspace. Both are plain
 * server-action POSTs (no optimistic UI — the page revalidates).
 */
export function TenantControls({
  tenantId,
  tenantName,
  capMinutes,
}: {
  tenantId: string;
  tenantName: string;
  capMinutes: number;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="grid gap-3">
      <div>
        <span className="text-sm font-bold text-neutral-300">Monthly cap (min)</span>
        <form action={setTenantCapAction} className="mt-1.5 flex flex-wrap gap-2">
          <input type="hidden" name="tenantId" value={tenantId} />
          <input
            name="capMinutes"
            type="number"
            min={0}
            defaultValue={capMinutes}
            className="w-28 rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
          />
          <FormButton variant="secondary" analyticsEvent="dashboard_tenant_cap_set" analyticsLabel={tenantName}>
            Set cap
          </FormButton>
        </form>
      </div>

      <div>
        <span className="text-sm font-bold text-neutral-300">Workspace name</span>
        {renaming ? (
          <form action={renameTenantAction} className="mt-1.5 flex flex-wrap gap-2">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input
              name="name"
              defaultValue={tenantName}
              className="min-w-[12rem] flex-1 rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
            />
            <FormButton variant="secondary" analyticsEvent="dashboard_tenant_rename_save" analyticsLabel={tenantName}>
              Save
            </FormButton>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-sm text-neutral-300">{tenantName}</span>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Rename
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
