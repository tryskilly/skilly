// DOM digest — the web analog of the desktop screenshot.
//
// Instead of sending pixels, we send the host page's *structure*: a compact,
// stable list of the interactive / annotated / heading elements the companion
// can talk about and point at. Each entry has a stable id, an accessible label,
// a role, and its current viewport rect. The accompanying registry maps ids
// back to live elements so the pointing engine can resolve a target.
//
// This is cheaper, more accurate, and more privacy-friendly than a screenshot
// (see docs/architecture/web-sdk-prd.md §6).

export interface DigestElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DigestElement {
  /** Stable id the AI references in a [POINT:id:label] tag. Prefers data-skilly. */
  id: string;
  /** Coarse role: button | link | input | heading | region. */
  role: string;
  /** Accessible name (aria-label / data-skilly / visible text / placeholder). */
  label: string;
  rect: DigestElementRect;
}

export interface DomDigest {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  elements: DigestElement[];
  /** True when more elements existed than `maxElements` — never silently dropped. */
  truncated: boolean;
}

/** Maps a digest id to the live element, for the pointing engine to resolve. */
export type ElementRegistry = Map<string, HTMLElement>;

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[onclick]",
  "[data-skilly]",
  "h1",
  "h2",
  "h3",
].join(",");

const MAX_LABEL_LENGTH = 80;

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

function accessibleLabel(element: HTMLElement): string {
  const candidate =
    element.getAttribute("aria-label") ??
    element.dataset.skillyLabel ??
    element.dataset.skilly ??
    element.getAttribute("placeholder") ??
    element.getAttribute("title") ??
    element.getAttribute("alt") ??
    element.textContent ??
    "";
  return candidate.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
}

function coarseRole(element: HTMLElement): string {
  const explicitRole = element.getAttribute("role");
  if (explicitRole) {
    return explicitRole;
  }
  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "input" || tag === "select" || tag === "textarea") return "input";
  if (tag === "h1" || tag === "h2" || tag === "h3") return "heading";
  return "region";
}

/**
 * Build a digest of the current page. Annotated (`data-skilly`) elements are
 * prioritized so authored targets always make the cut; the list is capped at
 * `maxElements` and `truncated` flags any overflow (no silent truncation).
 * Skilly's own widget is excluded.
 */
export function buildDomDigest(maxElements = 40): { digest: DomDigest; registry: ElementRegistry } {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
  ).filter((element) => !element.closest("[data-skilly-widget]") && isVisible(element));

  // Authored annotations first, then everything else (preserving DOM order within each group).
  candidates.sort((first, second) => {
    const firstAnnotated = first.hasAttribute("data-skilly") ? 0 : 1;
    const secondAnnotated = second.hasAttribute("data-skilly") ? 0 : 1;
    return firstAnnotated - secondAnnotated;
  });

  const truncated = candidates.length > maxElements;
  const selected = candidates.slice(0, maxElements);

  const registry: ElementRegistry = new Map();
  const elements: DigestElement[] = selected.map((element, index) => {
    const id = element.dataset.skilly ?? `el_${index + 1}`;
    registry.set(id, element);
    const rect = element.getBoundingClientRect();
    return {
      id,
      role: coarseRole(element),
      label: accessibleLabel(element),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    };
  });

  if (truncated) {
    console.warn(`[skilly] DOM digest capped at ${maxElements}; ${candidates.length} candidates found.`);
  }

  const digest: DomDigest = {
    url: window.location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    elements,
    truncated,
  };
  return { digest, registry };
}
