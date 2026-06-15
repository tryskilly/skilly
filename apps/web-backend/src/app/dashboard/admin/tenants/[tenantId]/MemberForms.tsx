"use client";

import { useActionState } from "react";
import { addMemberAction, removeMemberAction, type AddMemberState, type RemoveMemberState } from "../../../actions";
import { Button, Field, Select } from "../../../v2";

/** Add a WorkOS user as a member of this tenant (super-admin invite). */
export function AddMemberForm({ tenantId }: { tenantId: string }) {
  const [state, add, pending] = useActionState<AddMemberState, FormData>(addMemberAction, {});

  return (
    <form action={add} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field name="workosUserId" label="WorkOS user id" placeholder="user_01…" mono />
      <Field name="email" label="Email (optional)" type="email" placeholder="teammate@newco.com" />
      <Select
        name="role"
        label="Role"
        defaultValue="tenant_admin"
        options={[
          { value: "tenant_admin", label: "Tenant admin" },
          { value: "super_admin", label: "Super admin" },
        ]}
      />
      <div className="flex items-end">
        <Button variant="primary" analyticsEvent="dashboard_member_add_clicked" analyticsLabel="Add member" disabled={pending}>
          {pending ? "Adding…" : "Add member"}
        </Button>
      </div>

      {state.error && <p className="text-sm text-[#fca5a5] sm:col-span-2">{state.error}</p>}
      {state.ok && <p className="text-sm font-bold text-success sm:col-span-2">Member added.</p>}
    </form>
  );
}

/** Remove a single member (renders per row). Refuses the last super_admin server-side. */
export function RemoveMemberButton({ tenantId, workosUserId }: { tenantId: string; workosUserId: string }) {
  const [_state, remove, pending] = useActionState<RemoveMemberState, FormData>(removeMemberAction, {});

  return (
    <form action={remove}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="workosUserId" value={workosUserId} />
      <Button
        variant="danger"
        disabled={pending}
        analyticsEvent="dashboard_member_remove_clicked"
        analyticsLabel={workosUserId}
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}
