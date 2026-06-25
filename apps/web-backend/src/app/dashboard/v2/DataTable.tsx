import type { ReactNode } from "react";

/*
 * v2 data table (spec §4 data table, prototype .table). Dense but readable:
 * 44px row height, 11px uppercase muted header, mono cells, subtle row hover.
 * Columns are declared via children <th>/<td> so pages keep full control of
 * content; this component just enforces the shared styling.
 */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function DataTableHeader({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

/** Header cell — 11px uppercase, muted, tracked. */
export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`border-b border-line-soft px-[14px] py-3 text-[11px] font-extrabold uppercase tracking-[0.07em] text-gray-500 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

/** Body cell. Mono variant for keys/ids/origins. */
export function Td({
  children,
  mono = false,
  align = "left",
}: {
  children: ReactNode;
  mono?: boolean;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`border-b border-line-soft px-[14px] py-3 align-middle ${mono ? "font-mono text-[13px]" : ""} ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </td>
  );
}

/** Row wrapper — last row drops the bottom border; hover is on the row's cells. */
export function Tr({ children }: { children: ReactNode }) {
  return <tr className="group transition-colors hover:bg-white/[0.028]">{children}</tr>;
}
