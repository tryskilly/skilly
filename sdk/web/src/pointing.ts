// Selector-based pointing engine — the web analog of the desktop cursor overlay.
//
// The desktop app emits [POINT:x,y:label:screenN] (screen coordinates). In the
// browser we don't need coordinates: we have the DOM. The companion emits
// [POINT:target:label] where `target` is a digest id, a data-skilly key, a CSS
// selector, or visible text. We resolve it to a live element, fly the cursor
// along a bezier arc to it, and re-anchor on scroll/resize so it stays pinned.

import type { ElementRegistry } from "./digest.js";
import type { DomDigest } from "./digest.js";
import type { SkillyWidget } from "./widget.js";

export interface PointTag {
  target: string;
  label: string;
}

export interface ResolvedPoint {
  x: number;
  y: number;
  label: string;
  element: HTMLElement;
}

// Matches [POINT:<target>:<label>]. Targets (digest ids / data-skilly keys)
// don't contain ":" or "]", so the split is unambiguous.
const POINT_TAG_PATTERN = /\[POINT:([^:\]]+):([^\]]*)\]/g;

/** Extract POINT tags and return the response text with the tags stripped. */
export function parsePointTags(text: string): { cleanedText: string; points: PointTag[] } {
  const points: PointTag[] = [];
  const cleanedText = text
    .replace(POINT_TAG_PATTERN, (_match, target: string, label: string) => {
      points.push({ target: target.trim(), label: label.trim() });
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { cleanedText, points };
}

const DEFAULT_TARGET_ALIASES: Record<string, string[]> = {
  "primary-cta": ["download", "get started", "start", "try", "cta", "button"],
  "demo-video": ["demo", "video", "watch"],
  features: ["feature", "capability", "what it does"],
  "how-it-works": ["how it works", "steps", "setup"],
  skills: ["skill", "curriculum", "course"],
  pricing: ["pricing", "price", "cost", "plan", "billing"],
  faq: ["faq", "question", "safe", "cancel"],
  waitlist: ["waitlist", "coming soon", "windows", "linux", "mobile"],
  download: ["download", "install", "mac"],
};

/**
 * Best-effort fallback for live voice sessions. Audio transcript streams do not
 * always preserve non-spoken [POINT] tags, so infer a target when the assistant
 * clearly mentions a known annotated page element.
 */
export function inferPointFromText(text: string, digest?: DomDigest | null): PointTag | null {
  if (!digest || digest.elements.length === 0) {
    return null;
  }

  const haystack = normalizeForMatch(text);
  if (!haystack) {
    return null;
  }

  let best: { target: string; label: string; score: number } | null = null;
  for (const element of digest.elements) {
    const aliases = candidateAliases(element.id, element.label);
    for (const alias of aliases) {
      if (alias.length < 4 || !haystack.includes(alias)) {
        continue;
      }
      const score = alias.length + (element.id === alias ? 8 : 0);
      if (!best || score > best.score) {
        best = { target: element.id, label: element.label || element.id, score };
      }
    }
  }

  return best ? { target: best.target, label: best.label } : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateAliases(id: string, label: string): string[] {
  const rawAliases = [
    id,
    id.replace(/[-_]+/g, " "),
    label,
    label.replace(/[-_]+/g, " "),
    ...(DEFAULT_TARGET_ALIASES[id] ?? []),
  ];
  return Array.from(new Set(rawAliases.map(normalizeForMatch).filter(Boolean)));
}

/** Point the cursor at the element's center, clamped to the visible viewport. */
function anchorPoint(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(rect.left + rect.width / 2, 12, window.innerWidth - 12),
    y: clamp(rect.top + rect.height / 2, 12, window.innerHeight - 12),
  };
}

export class PointingEngine {
  private currentX: number;
  private currentY: number;
  private activeElement: HTMLElement | null = null;
  private reanchorListener: (() => void) | null = null;
  private animationFrame = 0;

  constructor(private widget: SkillyWidget) {
    // Start near the launcher (bottom-right), like the desktop cursor's home.
    this.currentX = window.innerWidth - 44;
    this.currentY = window.innerHeight - 44;
  }

  /**
   * Resolve a POINT target to a live element. Tries, in order: digest id,
   * `data-skilly` annotation, element id, raw CSS selector, then visible-text
   * match — so authored annotations are most robust but plain text still works.
   */
  resolve(target: string, registry?: ElementRegistry): HTMLElement | null {
    const fromRegistry = registry?.get(target);
    if (fromRegistry) {
      return fromRegistry;
    }

    const byAnnotation = document.querySelector<HTMLElement>(
      `[data-skilly="${cssEscape(target)}"]`,
    );
    if (byAnnotation) {
      return byAnnotation;
    }

    const byId = document.getElementById(target);
    if (byId instanceof HTMLElement) {
      return byId;
    }

    try {
      const bySelector = document.querySelector<HTMLElement>(target);
      if (bySelector) {
        return bySelector;
      }
    } catch {
      // `target` wasn't a valid selector — fall through to text matching.
    }

    return matchByVisibleText(target);
  }

  /** Resolve the target, fly the cursor to it, and keep it pinned. */
  async pointAt(target: string, label: string, registry?: ElementRegistry): Promise<ResolvedPoint | null> {
    const element = this.resolve(target, registry);
    if (!element) {
      console.warn(`[skilly] could not resolve POINT target: "${target}"`);
      return null;
    }

    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    await waitMs(220); // let smooth-scroll settle before measuring

    const point = anchorPoint(element);
    this.widget.showCursor();
    await this.fly(point.x, point.y);
    this.attachReanchor(element);
    return { x: point.x, y: point.y, label, element };
  }

  /** Stop pointing: cancel any flight, detach re-anchoring, hide the cursor. */
  clear(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    if (this.reanchorListener) {
      window.removeEventListener("scroll", this.reanchorListener);
      window.removeEventListener("resize", this.reanchorListener);
      this.reanchorListener = null;
    }
    this.activeElement = null;
    this.widget.hideCursor();
  }

  /** Animate the cursor from its current spot to the target along a bezier arc. */
  private fly(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      const startX = this.currentX;
      const startY = this.currentY;
      const deltaX = targetX - startX;
      const deltaY = targetY - startY;
      const distance = Math.hypot(deltaX, deltaY) || 1;

      // Control point offset perpendicular to the path → a gentle arc.
      const arc = Math.min(distance * 0.3, 120);
      const controlX = (startX + targetX) / 2 + (-deltaY / distance) * arc;
      const controlY = (startY + targetY) / 2 + (deltaX / distance) * arc;
      const durationMs = clamp(distance * 1.2, 350, 900);

      const startedAt = performance.now();
      const step = (now: number): void => {
        const linearT = Math.min((now - startedAt) / durationMs, 1);
        const easedT = 1 - Math.pow(1 - linearT, 3); // ease-out cubic
        const inverse = 1 - easedT;
        const x = inverse * inverse * startX + 2 * inverse * easedT * controlX + easedT * easedT * targetX;
        const y = inverse * inverse * startY + 2 * inverse * easedT * controlY + easedT * easedT * targetY;
        this.widget.setCursorPosition(x, y);

        if (linearT < 1) {
          this.animationFrame = requestAnimationFrame(step);
        } else {
          this.currentX = targetX;
          this.currentY = targetY;
          this.animationFrame = 0;
          resolve();
        }
      };
      this.animationFrame = requestAnimationFrame(step);
    });
  }

  /** Keep the cursor pinned to the element as the page scrolls/resizes. */
  private attachReanchor(element: HTMLElement): void {
    this.activeElement = element;
    const handler = (): void => {
      if (!this.activeElement) {
        return;
      }
      const point = anchorPoint(this.activeElement);
      this.currentX = point.x;
      this.currentY = point.y;
      this.widget.setCursorPosition(point.x, point.y);
    };
    this.reanchorListener = handler;
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
  }
}

function waitMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** CSS.escape with a conservative fallback for older engines. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

/** Last-resort resolution: a visible interactive/heading element whose text matches. */
function matchByVisibleText(target: string): HTMLElement | null {
  const needle = target.toLowerCase();
  const candidates = document.querySelectorAll<HTMLElement>(
    "a[href],button,[role=button],h1,h2,h3,[data-skilly]",
  );
  for (const candidate of candidates) {
    if (candidate.closest("[data-skilly-widget]")) {
      continue;
    }
    const text = (candidate.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text && text.includes(needle)) {
      return candidate;
    }
  }
  return null;
}
