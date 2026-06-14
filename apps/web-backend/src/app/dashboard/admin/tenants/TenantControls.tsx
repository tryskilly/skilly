"use client";

import { useState } from "react";
import { renameTenantAction, setTenantCapAction } from "../../actions";
import { Field, FormButton } from "../../ui";

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
    <div className="grid gap-5">
      <form action={setTenantCapAction} className="grid gap-2">
        <Field
          name="capMinutes"
          label="Monthly cap (minutes)"
          type="number"
          min={0}
          defaultValue={capMinutes}
          helper="0 means no paid access."
        />
        <input type="hidden" name="tenantId" value={tenantId} />
        <div>
          <FormButton variant="secondary" analyticsEvent="dashboard_tenant_cap_set" analyticsLabel={tenantName}>
            Set cap
          </FormButton>
        </div>
      </form>

      {renaming ? (
        <form action={renameTenantAction} className="grid gap-2">
          <Field name="name" label="Workspace name" defaultValue={tenantName} />
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="flex flex-wrap gap-2">
            <FormButton variant="secondary" analyticsEvent="dashboard_tenant_rename_save" analyticsLabel={tenantName}>
              Save
            </FormButton>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-400 transition hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-1.5">
          <span className="text-sm font-bold text-neutral-300">Workspace name</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-300">{tenantName}</span>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-400 transition hover:text-neutral-200"
            >
              Rename
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
