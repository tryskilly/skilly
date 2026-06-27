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
      this.bubbleElement.setAttribute("data-visible", "true");
    } else {
      this.bubbleMessageElement.textContent = "";
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

  /**
   * Reposition the response bubble near the cursor tip after it lands on a target.
   * Offsets to the right and above the cursor, clamped so the bubble stays on screen.
   */
  setBubbleNearCursor(cursorX: number, cursorY: number): void {
    const bubbleWidth = 320;
    const bubbleHeight = this.bubbleElement.offsetHeight || 90;
    const gap = 18;
    const edge = 16;

    let x = cursorX + gap;
    let y = cursorY - bubbleHeight - gap;

    // Clamp horizontally.
    x = Math.max(edge, Math.min(window.innerWidth - bubbleWidth - edge, x));
    // If it would go above the viewport, flip below the cursor instead.
    if (y < edge) {
      y = cursorY + gap;
    }
    // Clamp vertically so it never overflows the bottom either.
    y = Math.min(window.innerHeight - bubbleHeight - edge, y);

    this.bubbleElement.style.left = `${x}px`;
    this.bubbleElement.style.top = `${y}px`;
    this.bubbleElement.style.right = "";
    this.bubbleElement.style.bottom = "";
  }

  /** Return the bubble to its default position above the launcher (bottom-right). */
  resetBubblePosition(): void {
    this.bubbleElement.style.left = "";
    this.bubbleElement.style.top = "";
    this.bubbleElement.style.right = "20px";
    this.bubbleElement.style.bottom = "88px";
  }

  /** Remove the widget and its shadow root from the page. */
  destroy(): void {
    this.hostElement.remove();
  }
}
