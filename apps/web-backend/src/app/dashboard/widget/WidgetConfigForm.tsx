"use client";

import { useActionState, useState } from "react";
import { saveWidgetConfigAction, type WidgetConfigState } from "../actions";
import { Field, FormButton, Select } from "../ui";

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
 * The color input is the single source of truth (FormData key `accentColor`);
 * the hex label is a live read-only mirror of it.
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
  const [accent, setAccent] = useState(state.accentColor ?? initialAccentColor);

  return (
    <form action={save} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-neutral-300">Accent color</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              name="accentColor"
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-white/15 bg-transparent"
            />
            <span className="font-mono text-sm text-neutral-300">{accent}</span>
          </div>
        </label>

        <Select
          name="locale"
          label="Language"
          defaultValue={state.locale ?? initialLocale}
          options={LOCALES}
        />
      </div>

      <Field
        name="launcherLabel"
        label="Launcher label (optional)"
        defaultValue={initialLauncherLabel}
        placeholder="Ask Skilly"
        helper="Personalizes the floating button. Up to 24 characters."
      />

      <div className="flex items-center gap-3">
        <FormButton
          analyticsEvent="dashboard_widget_config_save_clicked"
          analyticsLabel="Save widget config"
          disabled={pending}
        >
          {pending ? "Saving..." : "Save widget config"}
        </FormButton>
        {state.ok && <span className="text-sm font-bold text-green-300">Saved</span>}
        {state.error && <span className="text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
