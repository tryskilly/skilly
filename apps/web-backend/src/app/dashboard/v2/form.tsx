import type { ReactNode } from "react";

/*
 * v2 form controls (spec §4 + tokens). Shared input styling: translucent
 * surface, 10px radius, amber focus ring. Field/Select are server-compatible
 * (plain inputs with name=); Toggle is client-only and lives in its own file.
 */

const controlBase =
  "w-full rounded-[10px] border border-line bg-white/[0.045] px-[11px] py-[10px] text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-amber-500/55 focus:ring-[3px] focus:ring-amber-500/12";

export function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  min,
  maxLength,
  helper,
  mono = false,
}: {
  label: string;
  name: string;
  type?: "text" | "number" | "password" | "email" | "url";
  placeholder?: string;
  defaultValue?: string | number;
  min?: number;
  maxLength?: number;
  helper?: string;
  /** Render the input in JetBrains Mono (keys, ids). */
  mono?: boolean;
}) {
  return (
    <label className="grid gap-[7px]">
      <span className="text-xs font-bold text-gray-300">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        maxLength={maxLength}
        className={`${controlBase} ${mono ? "font-mono" : ""}`}
      />
      {helper && <span className="text-xs text-gray-500">{helper}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  helper,
  onChange,
  disabled,
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  helper?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-[7px]">
      <span className="text-xs font-bold text-gray-300">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        className={`${controlBase} disabled:opacity-50`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper && <span className="text-xs text-gray-500">{helper}</span>}
    </label>
  );
}

/** A read-only display row used in settings (label + value, divided). */
export function DisplayRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-[18px] border-b border-line-soft py-[13px] last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-bold text-gray-100">{label}</div>
      </div>
      <div className="min-w-0 text-right text-sm text-gray-300">{children}</div>
    </div>
  );
}
