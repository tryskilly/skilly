"use client";

import { useRef } from "react";
import { Button } from "./primitives";
import { ConfirmModal } from "./ConfirmModal";

/** A "use server" action bound to a <form action={...}> (FormData → Promise<void>). */
type ServerAction = (formData: FormData) => Promise<void>;

/*
 * Convenience wrapper: a destructive form (server action) gated by a
 * confirmation modal. Used by server-component pages (origins, members) that
 * can't own refs themselves. `hiddenField` carries the action's FormData value
 * (e.g. the origin string or member id).
 */
export function ConfirmRemoveButton({
  action,
  hiddenFieldName,
  hiddenFieldValue,
  triggerLabel,
  title,
  body,
  confirmLabel,
  analyticsEvent,
  analyticsLabel,
}: {
  action: ServerAction;
  hiddenFieldName: string;
  hiddenFieldValue: string;
  triggerLabel: string;
  title: string;
  body: string;
  confirmLabel: string;
  analyticsEvent: string;
  analyticsLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={formRef} className="contents">
      <input type="hidden" name={hiddenFieldName} value={hiddenFieldValue} />
      <ConfirmModal
        trigger={
          <Button variant="danger" type="button" analyticsEvent={analyticsEvent} analyticsLabel={analyticsLabel}>
            {triggerLabel}
          </Button>
        }
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
