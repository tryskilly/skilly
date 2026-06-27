// The embeddable companion UI, isolated in a Shadow DOM so it neither leaks
// styles into the host page nor inherits the host's CSS.
//
// 8.1 scope: the visual shell — launcher button, response bubble, and the blue
// cursor element + a positioning method. The pointing ANIMATION driven by
// resolved selectors is Phase 8.2; the voice pipeline is Phase 8.3.

import { WIDGET_STYLES } from "./styles.js";
import type { SkillyState } from "./types.js";

// Inline SVGs so the widget has zero asset dependencies.
const SKILLY_MARK_ICON = /* html */ `
<svg class="skilly-launcher-mark" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M367 165c0-42 47-67 82-43l440 299c38 26 27 85-18 94l-118 24c-32 7-45 46-22 69l170 169c22 22 22 57 0 79l-77 77c-23 23-60 21-81-4L586 746c-20-24-56-27-80-8L425 801c-34 27-84 3-84-40V216c0-28 10-41 26-51Z" fill="currentColor"/>
</svg>`;

const CURSOR_ICON = /* html */ `
<svg class="skilly-cursor-mark" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M367 165c0-42 47-67 82-43l440 299c38 26 27 85-18 94l-118 24c-32 7-45 46-22 69l170 169c22 22 22 57 0 79l-77 77c-23 23-60 21-81-4L586 746c-20-24-56-27-80-8L425 801c-34 27-84 3-84-40V216c0-28 10-41 26-51Z" fill="currentColor"/>
</svg>`;

export class SkillyWidget {
  private hostElement: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private launcherButton!: HTMLButtonElement;
  private launcherLabelButton!: HTMLButtonElement;
  private bubbleElement!: HTMLDivElement;
  private bubbleMessageElement!: HTMLDivElement;
  private cursorElement!: HTMLDivElement;
  private idleLauncherLabel: string;

  // Tracks the user's real mouse position as a fallback position for the bubble.
  private lastMouseX = window.innerWidth - 60;
  private lastMouseY = window.innerHeight - 60;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  // When the AI cursor is pointing at a target, the bubble snaps there instead of the mouse.
  private pointingAnchorX: number | null = null;
  private pointingAnchorY: number | null = null;

  /** Set by the controller; fired when the user activates the companion. */
  public onLauncherActivated: (() => void) | null = null;

  constructor(accentColor: string, launcherLabel?: string) {
    this.idleLauncherLabel = launcherLabel?.trim() || "Click to ask Skilly";
    this.hostElement = document.createElement("div");
    this.hostElement.setAttribute("data-skilly-widget", "");
    this.shadowRoot = this.hostElement.attachShadow({ mode: "open" });

    const styleElement = document.createElement("style");
    styleElement.textContent = WIDGET_STYLES;
    this.shadowRoot.appendChild(styleElement);
    this.hostElement.style.setProperty("--skilly-accent", accentColor);

    this.renderLauncher(accentColor);
    this.renderBubble();
    this.renderCursor();

    // Always track the mouse so we have a fresh fallback position for the bubble.
    this.mouseMoveHandler = (e: MouseEvent) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      // Only follow the mouse when the AI cursor isn't anchored to a target.
      if (this.pointingAnchorX === null && this.bubbleElement.getAttribute("data-visible") === "true") {
        this.repositionBubble(e.clientX, e.clientY);
      }
    };
    document.addEventListener("mousemove", this.mouseMoveHandler, { passive: true });
  }

  /** Append the widget to the host page. */
  mount(): void {
    document.body.appendChild(this.hostElement);
  }

  private renderLauncher(accentColor: string): void {
    const activate = () => this.onLauncherActivated?.();

    this.launcherLabelButton = document.createElement("button");
    this.launcherLabelButton.className = "skilly-launcher-label";
    this.launcherLabelButton.type = "button";
    this.launcherLabelButton.textContent = this.idleLauncherLabel;
    this.launcherLabelButton.setAttribute("aria-label", this.idleLauncherLabel);
    this.launcherLabelButton.addEventListener("click", activate);
    this.shadowRoot.appendChild(this.launcherLabelButton);

    this.launcherButton = document.createElement("button");
    this.launcherButton.type = "button";
    this.launcherButton.className = "skilly-launcher";
    this.launcherButton.setAttribute("aria-label", this.idleLauncherLabel);
    this.launcherButton.setAttribute("data-state", "idle");
    this.launcherButton.style.color = accentColor;
    this.launcherButton.innerHTML = SKILLY_MARK_ICON;
    this.launcherButton.addEventListener("click", activate);
    this.shadowRoot.appendChild(this.launcherButton);
  }

  private renderBubble(): void {
    this.bubbleElement = document.createElement("div");
    this.bubbleElement.className = "skilly-bubble";
    this.bubbleElement.setAttribute("data-visible", "false");
    this.bubbleElement.setAttribute("role", "status");

    this.bubbleMessageElement = document.createElement("div");
    this.bubbleMessageElement.className = "skilly-bubble-message";
    this.bubbleElement.appendChild(this.bubbleMessageElement);

    const attributionLink = document.createElement("a");
    attributionLink.className = "skilly-attribution";
    attributionLink.href =
      "https://tryskilly.app?utm_source=skilly_widget&utm_medium=embedded_widget&utm_campaign=powered_by";
    attributionLink.target = "_blank";
    attributionLink.rel = "noopener noreferrer";
    attributionLink.textContent = "Powered by Skilly";
    this.bubbleElement.appendChild(attributionLink);

    this.shadowRoot.appendChild(this.bubbleElement);
  }

  private renderCursor(): void {
    this.cursorElement = document.createElement("div");
    this.cursorElement.className = "skilly-cursor";
    this.cursorElement.setAttribute("data-visible", "false");
    this.cursorElement.innerHTML = CURSOR_ICON;
    this.shadowRoot.appendChild(this.cursorElement);
  }

  /** Reflect the companion state on the launcher (drives the listening pulse). */
  setState(state: SkillyState): void {
    this.launcherButton.setAttribute("data-state", state);
    this.launcherLabelButton.setAttribute("data-state", state);
    const label =
      state === "idle"
        ? this.idleLauncherLabel
        : state === "thinking"
          ? "Starting…"
          : "Click to stop";
    this.launcherLabelButton.textContent = label;
    this.launcherLabelButton.setAttribute("aria-label", label);
    this.launcherButton.setAttribute("aria-label", label);
  }

  /** Show a message in the response bubble (empty string hides it). */
  setBubbleText(text: string): void {
    if (text) {
      this.bubbleMessageElement.textContent = text;
      // Use the pointing anchor if set, otherwise fall back to the last mouse position.
      const anchorX = this.pointingAnchorX ?? this.lastMouseX;
      const anchorY = this.pointingAnchorY ?? this.lastMouseY;
      this.repositionBubble(anchorX, anchorY);
      this.bubbleElement.setAttribute("data-visible", "true");
    } else {
      this.bubbleMessageElement.textContent = "";
      this.bubbleElement.setAttribute("data-visible", "false");
    }
  }

  /**
   * Pin the bubble near the AI cursor's landing position. Called by PointingEngine
   * after the cursor animation completes. Overrides mouse-following until cleared.
   */
  setBubbleAnchor(cursorX: number, cursorY: number): void {
    this.pointingAnchorX = cursorX;
    this.pointingAnchorY = cursorY;
    if (this.bubbleElement.getAttribute("data-visible") === "true") {
      this.repositionBubble(cursorX, cursorY);
    }
  }

  /** Release the pointing anchor — bubble resumes following the user's mouse. */
  clearBubbleAnchor(): void {
    this.pointingAnchorX = null;
    this.pointingAnchorY = null;
    if (this.bubbleElement.getAttribute("data-visible") === "true") {
      this.repositionBubble(this.lastMouseX, this.lastMouseY);
    }
  }

  /**
   * Core positioning: offset 22px right + 6px below the anchor (Mac constants),
   * flipping left near the right edge and above near the bottom edge.
   */
  private repositionBubble(anchorX: number, anchorY: number): void {
    const bubbleWidth = Math.min(320, window.innerWidth - 32);
    const bubbleHeight = this.bubbleElement.offsetHeight || 80;
    const offsetX = 22;
    const offsetY = 6;
    const edge = 16;

    let x = anchorX + offsetX;
    let y = anchorY + offsetY;

    if (x + bubbleWidth > window.innerWidth - edge) {
      x = anchorX - offsetX - bubbleWidth;
    }
    if (y + bubbleHeight > window.innerHeight - edge) {
      y = anchorY - offsetY - bubbleHeight;
    }

    x = Math.max(edge, Math.min(window.innerWidth - bubbleWidth - edge, x));
    y = Math.max(edge, Math.min(window.innerHeight - bubbleHeight - edge, y));

    this.bubbleElement.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Make the cursor visible (positioning is driven by the PointingEngine). */
  showCursor(): void {
    this.cursorElement.setAttribute("data-visible", "true");
  }

  /**
   * Set the cursor's viewport position instantly. The PointingEngine calls this
   * per animation frame to fly the cursor along a bezier arc (Phase 8.2), so the
   * element itself has no CSS transform transition. Offset by a few px so the
   * cursor's tip — not its top-left corner — lands on the target.
   */
  setCursorPosition(viewportX: number, viewportY: number): void {
    this.cursorElement.style.transform = `translate(${viewportX - 3}px, ${viewportY - 3}px)`;
  }

  hideCursor(): void {
    this.cursorElement.setAttribute("data-visible", "false");
  }

  /** Remove the widget and its shadow root from the page. */
  destroy(): void {
    if (this.mouseMoveHandler) {
      document.removeEventListener("mousemove", this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
    this.hostElement.remove();
  }
}
