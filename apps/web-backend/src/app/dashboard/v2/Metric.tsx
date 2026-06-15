import type { ReactNode } from "react";

/*
 * v2 metric tile (spec §5.8 usage strip, prototype .metric). Compact label +
 * big tracked value + muted foot. Used in horizontal metric strips on the
 * overview and usage pages.
 */
export function Metric({
  label,
  value,
  foot,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  tone?: "neutral" | "amber" | "green" | "red";
}) {
  const valueTone = {
    neutral: "text-gray-100",
    amber: "text-amber-300",
    green: "text-success",
    red: "text-[#fca5a5]",
  } as const;

  return (
    <div className="rounded-[14px] border border-line-soft bg-white/[0.035] p-4">
      <div className="text-xs font-bold tracking-[0.02em] text-muted">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold tracking-[-0.045em] ${valueTone[tone]}`}>{value}</div>
      {foot && <div className="mt-1 text-xs text-gray-500">{foot}</div>}
    </div>
  );
}
