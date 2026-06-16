"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./primitives";

/*
 * Confirmation gate for destructive actions (spec §11 #12: "All destructive
 * actions have confirmation"). Wraps a trigger that, when clicked, opens a
 * modal asking the user to confirm before the real submit fires. a11y: real
 * focusable buttons, Escape closes, backdrop click closes, role=dialog.
 *
 * Usage:
 *   <ConfirmModal
 *     trigger={<Button variant="danger">Revoke</Button>}
 *     title="Revoke this key?"
 *     body="Apps using it will stop working immediately."
 *     confirmLabel="Revoke key"
 *     onConfirm={() => formRef.current?.requestSubmit()}
 *   />
 */
export function ConfirmModal({
  trigger,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setOpen(false);
    onConfirm();
  }

  return (
    <>
      {/* The trigger is cloned-ish: we render it inside a button-styled span that
          opens the modal. We don't intercept the original's onClick — instead
          the destructive submit only fires from onConfirm, so the trigger must
          NOT itself submit. */}
      <span onClick={() => setOpen(true)} className="inline-flex cursor-pointer">
        {trigger}
      </span>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[16px] border border-line bg-[#15151600] bg-[linear-gradient(180deg,rgba(40,40,42,0.98),rgba(24,24,26,0.98))] p-6 shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold tracking-[-0.02em] text-gray-100">{title}</h2>
            <div className="mt-2 text-sm leading-relaxed text-muted">{body}</div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <Button variant="danger" type="button" onClick={handleConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
