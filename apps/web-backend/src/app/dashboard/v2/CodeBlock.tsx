"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/*
 * v2 code block (spec §4 code block, prototype .codeblock). Header bar with a
 * language label + copy button that confirms "Copied" for 1.5s. Long code
 * scrolls horizontally. Important attributes can be highlighted via the
 * `highlight` prop wrapping tokens in amber.
 */
export function CodeBlock({
  language,
  code,
  label,
  highlight,
}: {
  language?: string;
  code: string;
  label?: string;
  /** Tokens to render in amber (e.g. ["data-skilly-key", "data-skilly-skill"]). */
  highlight?: string[];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (permissions / non-secure context). No-op.
    }
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-[#141416]">
      <div className="flex h-[42px] items-center justify-between border-b border-line-soft px-3 text-muted">
        <span className="font-mono text-xs">{label ?? language ?? "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-line bg-white/[0.055] px-2.5 text-xs font-bold text-gray-200 transition hover:bg-white/[0.085]"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-auto p-4 font-mono text-[13px] leading-[1.72] text-gray-300">{renderCode(code, highlight)}</pre>
    </div>
  );
}

/** Render code, wrapping any `highlight` token occurrences in an amber span. */
function renderCode(code: string, highlight?: string[]): React.ReactNode {
  if (!highlight || highlight.length === 0) {
    return code;
  }
  const escaped = highlight.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");
  return code.split(pattern).map((part, index) =>
    highlight.includes(part) ? (
      <span key={index} className="text-amber-300">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}
