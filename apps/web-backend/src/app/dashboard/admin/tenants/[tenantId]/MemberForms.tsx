"use client";

import { useActionState } from "react";
import { addMemberAction, removeMemberAction, type AddMemberState, type RemoveMemberState } from "../../../actions";
import { FormButton } from "../../../ui";

/** Add a WorkOS user as a member of this tenant (super-admin invite). */
export function AddMemberForm({ tenantId }: { tenantId: string }) {
  const [state, add, pending] = useActionState<AddMemberState, FormData>(addMemberAction, {});

  return (
    <form action={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <input type="hidden" name="tenantId" value={tenantId} />
      <label className="grid gap-1.5">
        <span className="text-sm font-bold text-neutral-300">WorkOS user id</span>
        <input
          name="workosUserId"
          placeholder="user_01…"
          className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 font-mono text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-amber-500/80"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold text-neutral-300">Email (optional)</span>
        <input
          name="email"
          type="email"
          placeholder="teammate@newco.com"
          className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-amber-500/80"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold text-neutral-300">Role</span>
        <select
          name="role"
          defaultValue="tenant_admin"
          className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
        >
          <option value="tenant_admin">Tenant admin</option>
          <option value="super_admin">Super admin</option>
        </select>
      </label>
      <FormButton analyticsEvent="dashboard_member_add_clicked" analyticsLabel="Add member" disabled={pending}>
        {pending ? "Adding..." : "Add member"}
      </FormButton>

      {state.error && (
        <p className="text-sm text-red-400 sm:col-span-2 lg:col-span-4">{state.error}</p>
      )}
      {state.ok && <p className="text-sm font-bold text-green-300 sm:col-span-2 lg:col-span-4">Member added.</p>}
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
      <FormButton variant="danger" disabled={pending} analyticsEvent="dashboard_member_remove_clicked" analyticsLabel={workosUserId}>
        {pending ? "Removing..." : "Remove"}
      </FormButton>
    </form>
  );
}
