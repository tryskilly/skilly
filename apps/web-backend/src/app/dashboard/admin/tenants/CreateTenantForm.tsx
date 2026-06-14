"use client";

import { useActionState } from "react";
import { createTenantAction, type CreateTenantState } from "../../actions";
import { FormButton } from "../../ui";

/** Super-admin form to create a new tenant workspace. */
export function CreateTenantForm() {
  const [state, create, pending] = useActionState<CreateTenantState, FormData>(createTenantAction, {});

  return (
    <form action={create} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <label className="grid gap-1.5">
        <span className="text-sm font-bold text-neutral-300">Tenant name</span>
        <input
          name="name"
          placeholder="Newco Inc."
          className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-amber-500/80"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold text-neutral-300">Monthly cap (min)</span>
        <input
          name="capMinutes"
          type="number"
          min={0}
          defaultValue={0}
          className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
        />
      </label>
      <FormButton analyticsEvent="dashboard_tenant_create_clicked" analyticsLabel="Create tenant" disabled={pending}>
        {pending ? "Creating..." : "Create tenant"}
      </FormButton>

      {state.error && <p className="text-sm text-red-400 sm:col-span-3">{state.error}</p>}
      {state.tenantId && (
        <p className="text-sm font-bold text-green-300 sm:col-span-3">
          Created.{" "}
          <a
            href={`/dashboard/admin/tenants/${state.tenantId}`}
            className="text-amber-300 underline underline-offset-2 hover:text-amber-200"
          >
            Manage the new tenant →
          </a>
        </p>
      )}
    </form>
  );
}
