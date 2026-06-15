import Link from "next/link";
import type { ReactNode } from "react";

/*
 * Skilly Web v2 core primitives. Source of truth:
 * skilly_web_v2_component_contracts.md + skilly_web_v2_tokens.css.
 * Amber is the single accent (spec §1 color usage rule): primary CTAs, active
 * nav, focus rings only — never every border or every icon.
 */

/** Tailwind class strings shared across button surfaces. */
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[9px] h-[38px] px-[13px] text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants = {
  // The one main action per screen. Amber fill, dark text, soft amber shadow.
  primary:
    "bg-amber-500 text-gray-950 border border-white/12 shadow-[0_10px_24px_rgba(245,158,11,0.16)] hover:bg-amber-600",
  // Secondary actions. Translucent surface, light text.
  secondary: "bg-white/[0.055] text-gray-200 border border-white/[0.11] hover:bg-white/[0.085]",
  // Tertiary/low-emphasis. Transparent, muted text, surface fill on hover.
  ghost: "bg-transparent text-gray-400 border border-transparent hover:bg-white/[0.045] hover:text-gray-200",
  // Revoke/remove/delete only. Red-tinted.
  danger:
    "bg-[rgba(239,68,68,0.09)] text-[#fecaca] border border-[rgba(239,68,68,0.25)] hover:bg-[rgba(239,68,68,0.16)]",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

/** Submit button (for use inside <form action={serverAction}>) or a clickable button (onClick). */
export function Button({
  children,
  variant = "secondary",
  disabled,
  type = "submit",
  className,
  analyticsEvent,
  analyticsLabel,
  onClick,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "submit" | "button";
  className?: string;
  analyticsEvent?: string;
  analyticsLabel?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      data-analytics-event={analyticsEvent}
      data-analytics-label={analyticsLabel}
      className={`${buttonBase} ${buttonVariants[variant]} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Link styled as a button (navigation, not form submission). */
export function ButtonLink({
  href,
  children,
  variant = "secondary",
  className,
  analyticsEvent,
  analyticsLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  analyticsEvent?: string;
  analyticsLabel?: string;
}) {
  return (
    <Link
      href={href}
      data-analytics-event={analyticsEvent}
      data-analytics-label={analyticsLabel}
      data-analytics-target={href}
      className={`${buttonBase} ${buttonVariants[variant]} ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}

/** Status pill with an optional colored dot. Color is never the only signal — pair with a label. */
export function StatusPill({
  tone = "neutral",
  label,
  showDot = false,
  className,
}: {
  tone?: "neutral" | "amber" | "green" | "red";
  label: ReactNode;
  showDot?: boolean;
  className?: string;
}) {
  const dotTone = {
    neutral: "bg-gray-400",
    amber: "bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]",
    green: "bg-success shadow-[0_0_0_3px_rgba(34,197,94,0.12)]",
    red: "bg-error shadow-[0_0_0_3px_rgba(239,68,68,0.12)]",
  } as const;

  const pillTone = {
    neutral: "border-line bg-surface text-gray-300",
    amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    green: "border-success/25 bg-success/15 text-success",
    red: "border-error/30 bg-error/15 text-[#fca5a5]",
  } as const;

  return (
    <span
      className={`inline-flex h-[26px] items-center gap-[7px] rounded-full border px-[9px] text-xs font-semibold ${pillTone[tone]} ${className ?? ""}`}
    >
      {showDot && <span className={`h-[7px] w-[7px] rounded-full ${dotTone[tone]}`} />}
      {label}
    </span>
  );
}

/** Eyebrow badge above page titles (e.g. the "Overview" chip). Renders uppercase. */
export function Eyebrow({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "neutral" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-[9px] py-0.5 text-xs font-semibold uppercase tracking-wide ${tone === "neutral" ? "border-line bg-surface text-gray-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}`}
    >
      {children}
    </span>
  );
}

/**
 * Canonical page header: eyebrow + 24px/700 title + muted subtitle + optional action.
 * Every dashboard page starts with this so the header scale is identical (spec §1 type).
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
    <header className="mb-6 flex flex-wrap items-start justify-between gap-[18px]">
      <div>
        <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.035em] text-gray-100">{title}</h1>
        {description && <p className="mt-[7px] max-w-[690px] text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-[10px]">{action}</div>}
    </header>
  );
}

/**
 * Panel — the v2 replacement for "card". Spec §3: use panels, not noisy cards.
 * Main panels and elevated panels share a border; elevation is a slightly
 * stronger surface gradient.
 */
export function Panel({
  children,
  className,
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-[16px] border border-line shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${elevated ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.04))]" : "bg-[linear-gradient(180deg,rgba(255,255,255,0.058),rgba(255,255,255,0.034))]"} ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

/** Panel header band (title + subtitle + optional action), separated by a soft border. */
export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-[14px] border-b border-line-soft px-[18px] py-[17px]">
      <div>
        <div className="text-[15px] font-bold tracking-[-0.01em] text-gray-100">{title}</div>
        {description && <div className="mt-[3px] text-[13px] text-muted">{description}</div>}
      </div>
      {action}
    </div>
  );
}

/** Panel body padding. */
export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`p-[18px] ${className ?? ""}`}>{children}</div>;
}

/** Section sub-title inside a panel body. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[15px] font-bold tracking-[-0.01em] text-gray-100">{children}</div>;
}
