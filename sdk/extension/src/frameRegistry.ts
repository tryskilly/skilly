// Multi-frame coordination — the one piece of logic with no @skilly/web precedent. Two
// different iframes can each independently assign "el_1" to their own first element, so the
// model-facing merged view must qualify every id by frame, and every POINT/action directive
// must be un-qualified back to (frameId, localTarget) before it's routed to the right frame's
// content script. This file has zero chrome.* dependencies — it is pure and DOM-free, so it is
// fully unit-testable without a browser.
import type { DomDigest, DigestElement } from "@skilly/browser-core";

export interface QualifiedTarget {
  frameId: number;
  localTarget: string;
}

/**
 * Only the first colon separates the qualifier from the local target: local ids come from
 * author-supplied `data-skilly` values, which may themselves contain colons.
 */
const QUALIFIED_TARGET_PATTERN = /^f(\d+):(.+)$/;

/** Frame id of the top-level page. Chrome's extension APIs always assign the main frame 0. */
const TOP_FRAME_ID = 0;

export function qualifyElementId(frameId: number, localId: string): string {
  return `f${frameId}:${localId}`;
}

export function parseQualifiedTarget(qualifiedId: string): QualifiedTarget | null {
  const match = QUALIFIED_TARGET_PATTERN.exec(qualifiedId);
  if (!match) {
    return null;
  }
  return { frameId: Number(match[1]), localTarget: match[2]! };
}

export class FrameRegistry {
  private frames = new Map<number, DomDigest>();

  /** Replaces any previous digest for this frame — content scripts re-send on DOM change. */
  registerFrame(frameId: number, digest: DomDigest): void {
    this.frames.set(frameId, digest);
  }

  unregisterFrame(frameId: number): void {
    this.frames.delete(frameId);
  }

  clear(): void {
    this.frames.clear();
  }

  /** Merge every registered frame's digest into one model-facing view with frame-qualified ids. */
  mergedDigest(): DomDigest {
    const topFrameDigest = this.frames.get(TOP_FRAME_ID);
    const elements: DigestElement[] = [];
    let truncated = false;

    // Sort by frame id rather than relying on Map insertion order: frames load in arbitrary
    // order, so an iframe's content script may well register before the top frame's, and the
    // merged view should still read top-frame-first.
    const frameIdsInOrder = [...this.frames.keys()].sort((left, right) => left - right);
    for (const frameId of frameIdsInOrder) {
      const digest = this.frames.get(frameId)!;
      truncated = truncated || digest.truncated;
      for (const element of digest.elements) {
        elements.push({ ...element, id: qualifyElementId(frameId, element.id) });
      }
    }

    // url/title/viewport describe the page as a whole, so they come from the top frame only.
    // A merge with no top frame registered yet stays well-formed rather than throwing.
    return {
      url: topFrameDigest?.url ?? "",
      title: topFrameDigest?.title ?? "",
      viewport: topFrameDigest?.viewport ?? { width: 0, height: 0 },
      elements,
      truncated,
    };
  }
}
