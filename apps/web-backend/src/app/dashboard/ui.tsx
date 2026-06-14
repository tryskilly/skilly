import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function SkillyMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[10px] border border-amber-300/20 bg-neutral-950 shadow-[0_0_28px_rgba(245,158,11,0.16)]"
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/skilly-app-icon.png"
        alt="Skilly"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority={size > 32}
      />
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.025em] text-neutral-100">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-neutral-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Canonical page header: eyebrow badge + 4xl headline + supporting copy.
 * Every dashboard page starts with this so the header scale is identical
 * across overview, install, widget, keys, skill, usage, billing, settings,
 * and the super-admin directory.
 */
export function PageHeader({
  eyebrow,
  eyebrowTone = "amber",
  title,
  description,
  action,
}: {
  eyebrow: string;
  eyebrowTone?: "amber" | "neutral";
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Badge tone={eyebrowTone}>{eyebrow}</Badge>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-tight tracking-[-0.045em]">{title}</h1>
        {description && <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-400">{description}</p>}
      </div>
      {action}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "amber" | "green" | "red" | "neutral";
}) {
  const tones = {
    amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    green: "border-green-500/25 bg-green-500/15 text-green-300",
    red: "border-red-500/30 bg-red-500/15 text-red-300",
    neutral: "border-white/10 bg-white/[0.04] text-neutral-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  analyticsEvent,
  analyticsLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  analyticsEvent?: string;
  analyticsLabel?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-amber-500 text-neutral-950 hover:bg-amber-600"
      : "border border-white/10 bg-white/[0.05] text-neutral-300 hover:bg-white/[0.08]";
  return (
    <Link
      href={href}
      data-analytics-event={analyticsEvent}
      data-analytics-label={analyticsLabel}
      data-analytics-target={href}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-bold transition active:scale-[0.98] ${styles}`}
    >
      {children}
    </Link>
  );
}

export function FormButton({
  children,
  variant = "primary",
  disabled,
  analyticsEvent,
  analyticsLabel,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  analyticsEvent?: string;
  analyticsLabel?: string;
}) {
  const styles = {
    primary: "bg-amber-500 text-neutral-950 hover:bg-amber-600",
    secondary: "border border-white/10 bg-white/[0.05] text-neutral-300 hover:bg-white/[0.08]",
    danger: "border border-red-500/30 bg-red-500/15 text-red-200 hover:bg-red-500/25",
  };
  return (
    <button
      type="submit"
      disabled={disabled}
      data-analytics-event={analyticsEvent}
      data-analytics-label={analyticsLabel}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

// Shared input control styling so every field across the dashboard renders
// identically (per skilly-design-system §6: dark rgba bg, 8px radius, amber focus).
const inputClasses =
  "w-full rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-amber-500/80";

export function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  min,
  helper,
}: {
  label: string;
  name: string;
  type?: "text" | "number" | "password" | "email" | "url";
  placeholder?: string;
  defaultValue?: string | number;
  min?: number;
  helper?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-bold text-neutral-300">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        className={inputClasses}
      />
      {helper && <span className="text-xs text-neutral-500">{helper}</span>}
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
    <label className="grid gap-1.5">
      <span className="text-sm font-bold text-neutral-300">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        className={`${inputClasses} disabled:opacity-50`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper && <span className="text-xs text-neutral-500">{helper}</span>}
    </label>
  );
}

export function UsageMeter({
  usedSeconds,
  capSeconds,
}: {
  usedSeconds: number;
  capSeconds: number;
}) {
  const usedMinutes = Math.round(usedSeconds / 60);
  const capMinutes = Math.round(capSeconds / 60);
  const fraction = capSeconds > 0 ? Math.min(1, usedSeconds / capSeconds) : 0;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-extrabold tracking-[-0.04em]">
            {usedMinutes}
            {capSeconds > 0 && <span className="text-neutral-500"> / {capMinutes}</span>}
          </div>
          <p className="text-xs text-neutral-500">
            {capSeconds > 0 ? "minutes used this month" : "minutes used on unlimited cap"}
          </p>
        </div>
        <Badge tone={capSeconds > 0 && fraction > 0.8 ? "amber" : "neutral"}>
          {capSeconds > 0 ? `${Math.round(fraction * 100)}% used` : "unlimited"}
        </Badge>
      </div>
      {capSeconds > 0 && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="max-w-full overflow-auto rounded-xl border border-white/10 bg-neutral-950 p-4 font-mono text-sm leading-relaxed text-neutral-300">
      {children}
    </pre>
  );
}
