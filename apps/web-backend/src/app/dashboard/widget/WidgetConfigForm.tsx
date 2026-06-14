"use client";

import { useActionState, useRef } from "react";
import { saveWidgetConfigAction, type WidgetConfigState } from "../actions";
import { FormButton } from "../ui";

const LOCALES: Array<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
  { value: "ar", label: "العربية" },
  { value: "pt", label: "Português" },
];

/**
 * Editable widget appearance/behavior. accent + locale map to the
 * data-skilly-accent / data-skilly-locale attrs the embedded SDK reads.
 */
export function WidgetConfigForm({
  initialAccentColor,
  initialLocale,
  initialLauncherLabel,
}: {
  initialAccentColor: string;
  initialLocale: string;
  initialLauncherLabel: string;
}) {
  const [state, save, pending] = useActionState<WidgetConfigState, FormData>(saveWidgetConfigAction, {});
  // Keep the hex text field in sync with the native color picker without a
  // round-trip — purely cosmetic, both inputs submit under the same FormData key.
  const hexTextRef = useRef<HTMLInputElement>(null);

  const accent = state.accentColor ?? initialAccentColor;
  const locale = state.locale ?? initialLocale;

  function syncHexText(event: React.ChangeEvent<HTMLInputElement>) {
    if (hexTextRef.current) {
      hexTextRef.current.value = event.target.value;
    }
  }

  return (
    <form action={save} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-neutral-300">Accent color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              name="accentColor"
              defaultValue={accent}
              onChange={syncHexText}
              className="h-10 w-12 rounded-md border border-white/15 bg-transparent"
            />
            <input
              ref={hexTextRef}
              name="accentColorText"
              defaultValue={accent}
              readOnly
              className="flex-1 rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 font-mono text-sm text-neutral-300 outline-none"
            />
          </div>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-neutral-300">Language</span>
          <select
            name="locale"
            defaultValue={locale}
            className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
          >
            {LOCALES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-neutral-300">Launcher label (optional)</span>
          <input
            name="launcherLabel"
            defaultValue={initialLauncherLabel}
            placeholder="Ask Skilly"
            maxLength={24}
            className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-amber-500/80"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <FormButton analyticsEvent="dashboard_widget_config_save_clicked" analyticsLabel="Save widget config" disabled={pending}>
          {pending ? "Saving..." : "Save widget config"}
        </FormButton>
        {state.ok && <span className="text-sm font-bold text-green-300">Saved</span>}
        {state.error && <span className="text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
