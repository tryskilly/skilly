"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button, ConfirmModal } from "../../v2";
import { compMacPlanAction, extendMacTrialAction } from "./actions";

function ConfirmFollowUpAction({ action, userId, label, title, body }: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  label: string;
  title: string;
  body: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="userId" value={userId} />
      <ConfirmationTrigger label={label} title={title} body={body} onConfirm={() => formRef.current?.requestSubmit()} />
    </form>
  );
}

function ConfirmationTrigger({ label, title, body, onConfirm }: {
  label: string;
  title: string;
  body: string;
  onConfirm: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <ConfirmModal
      trigger={<Button type="button" disabled={pending}>{pending ? "Saving…" : label}</Button>}
      title={title}
      body={body}
      confirmLabel={label}
      onConfirm={() => { if (!pending) onConfirm(); }}
    />
  );
}

export function MacFollowUpActions({ userId, customerName }: { userId: string; customerName: string }) {
  const customer = customerName === userId ? userId : `${customerName} (${userId})`;
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmFollowUpAction
        action={extendMacTrialAction}
        userId={userId}
        label="Extend trial +15 min"
        title="Extend this Mac trial?"
        body={`Reduce ${customer}'s recorded trial usage by 900 seconds, stopping at zero, to restore up to 15 trial minutes. For older accounts, first count previous hosted usage. Save this trial balance for future requests.`}
      />
      <ConfirmFollowUpAction
        action={compMacPlanAction}
        userId={userId}
        label="Give 30 minutes"
        title="Give 30 minutes?"
        body={`Give ${customer} 30 minutes of Skilly, usable within the next 30 days. When the minutes run out, Skilly asks them to upgrade. A later Polar subscription replaces this offer.`}
      />
    </div>
  );
}
