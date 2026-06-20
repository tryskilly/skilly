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
<svg class="skilly-launcher-mark" viewBox="0 0 80 80" aria-hidden="true">
  <path d="M20 8C18 7 16 9 16 11L16 60C16 62 18 64 20 63L34 52C35 51 37 51 38 52L50 66C51 67 53 68 55 67L61 61C63 59 62 57 61 56L49 44C48 43 48 41 49 40L58 38C60 37 61 35 59 34L20 8Z" fill="currentColor"/>
</svg>`;

const CURSOR_ICON = /* html */ `
<svg viewBox="0 0 24 24" fill="#2F6BFF" stroke="#fff" stroke-width="1.5" stroke-linejoin="round">
  <path d="M5 3l14 7-6 2-2 6-6-15z"/>
</svg>`;

export class SkillyWidget {
  private hostElement: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private launcherButton!: HTMLButtonElement;
  private launcherLabelButton!: HTMLButtonElement;
  private bubbleElement!: HTMLDivElement;
  private cursorElement!: HTMLDivElement;
  private idleLauncherLabel: string;

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
      this.bubbleElement.textContent = text;
      this.bubbleElement.setAttribute("data-visible", "true");
    } else {
      this.bubbleElement.setAttribute("data-visible", "false");
    }
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
    this.hostElement.remove();
  }
}
