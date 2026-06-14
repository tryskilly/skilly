"use client";

import { useActionState } from "react";
import { createTenantAction, type CreateTenantState } from "../../actions";
import { Field, FormButton } from "../../ui";

/** Super-admin form to create a new tenant workspace. */
export function CreateTenantForm() {
  const [state, create, pending] = useActionState<CreateTenantState, FormData>(createTenantAction, {});

  return (
    <form action={create} className="grid gap-4">
      <Field name="name" label="Tenant name" placeholder="Newco Inc." />
      <Field
        name="capMinutes"
        label="Monthly cap (minutes)"
        type="number"
        min={0}
        defaultValue={0}
        helper="Use 0 for no paid access — you can adjust this later."
      />
      <div>
        <FormButton analyticsEvent="dashboard_tenant_create_clicked" analyticsLabel="Create tenant" disabled={pending}>
          {pending ? "Creating..." : "Create tenant"}
        </FormButton>
      </div>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.tenantId && (
        <p className="text-sm font-bold text-green-300">
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
