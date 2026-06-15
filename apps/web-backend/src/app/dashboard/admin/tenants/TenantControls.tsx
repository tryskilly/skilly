"use client";

import { useState } from "react";
import { renameTenantAction, setTenantCapAction } from "../../actions";
import { Button, Field } from "../../v2";

/**
 * Per-tenant super-admin controls: adjust the monthly usage cap and rename the
 * workspace. Both are plain server-action POSTs (no optimistic UI — the page
 * revalidates).
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
          <Button variant="secondary" analyticsEvent="dashboard_tenant_cap_set" analyticsLabel={tenantName}>
            Set cap
          </Button>
        </div>
      </form>

      {renaming ? (
        <form action={renameTenantAction} className="grid gap-2">
          <Field name="name" label="Workspace name" defaultValue={tenantName} />
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" analyticsEvent="dashboard_tenant_rename_save" analyticsLabel={tenantName}>
              Save
            </Button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="inline-flex h-[38px] items-center rounded-[9px] border border-line px-[13px] text-sm font-bold text-gray-400 transition hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-[7px]">
          <span className="text-xs font-bold text-gray-300">Workspace name</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">{tenantName}</span>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="inline-flex h-[26px] items-center rounded-[8px] border border-line px-2.5 text-xs font-bold text-gray-400 transition hover:text-gray-200"
            >
              Rename
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
