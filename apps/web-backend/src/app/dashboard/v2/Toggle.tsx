"use client";

import { useState } from "react";

/*
 * v2 toggle switch (spec §6.2 widget settings, prototype .toggle). On = amber;
 * off = neutral. Used for behavior toggles (auto-open, reduced-motion, etc.).
 * Renders a hidden checkbox so it submits a real FormData boolean when used
 * inside a server-action form.
 */
export function Toggle({
  name,
  defaultOn,
  onChange,
  disabled,
}: {
  name?: string;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(Boolean(defaultOn));

  function toggle() {
    if (disabled) return;
    const next = !on;
    setOn(next);
    onChange?.(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={`relative h-[24px] w-[42px] shrink-0 rounded-full border border-white/10 p-[3px] transition disabled:opacity-50 ${on ? "bg-amber-500/24" : "bg-white/12"}`}
    >
      {/* Hidden checkbox carries the value into FormData for server actions. */}
      {name && <input type="hidden" name={name} value={on ? "true" : "false"} />}
      <span
        className={`block h-[18px] w-[18px] rounded-full transition-transform ${on ? "translate-x-[18px] bg-amber-400" : "bg-gray-400"}`}
      />
    </button>
  );
}
