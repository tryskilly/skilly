"use client";

import { useActionState } from "react";
import { createTenantAction, type CreateTenantState } from "../../actions";
import { Button, Field } from "../../v2";

/** Super-admin form to create a new tenant workspace. */
export function CreateTenantForm() {
  const [state, create, pending] = useActionState<CreateTenantState, FormData>(createTenantAction, {});

  return (
    <form action={create} className="grid gap-4 sm:grid-cols-2">
      <Field name="name" label="Tenant name" placeholder="Newco Inc." />
      <Field
        name="capMinutes"
        label="Monthly cap (minutes)"
        type="number"
        min={0}
        defaultValue={0}
        helper="Use 0 for no paid access — adjustable later."
      />
      <div className="sm:col-span-2">
        <Button variant="primary" analyticsEvent="dashboard_tenant_create_clicked" analyticsLabel="Create tenant" disabled={pending}>
          {pending ? "Creating…" : "Create tenant"}
        </Button>
      </div>

      {state.error && <p className="text-sm text-[#fca5a5] sm:col-span-2">{state.error}</p>}
      {state.tenantId && (
        <p className="text-sm font-bold text-success sm:col-span-2">
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
