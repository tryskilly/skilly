// The second CursorHost implementation (the first is SkillyWidget in sdk/web). Deliberately NOT
// shared with sdk/web: this has no launcher, no response bubble, no mic control — those mount
// once in the top frame only (the background's top-frame coordination), never per-frame.
// position: fixed inside THIS frame's own document is sufficient for correct on-screen placement
// even inside a cross-origin iframe — no cross-frame coordinate math needed.
import type { CursorHost } from "@skilly/browser-core";

const CURSOR_ICON = /* html */ `
<svg viewBox="0 0 1024 1024" aria-hidden="true" width="20" height="20">
  <path d="M367 165c0-42 47-67 82-43l440 299c38 26 27 85-18 94l-118 24c-32 7-45 46-22 69l170 169c22 22 22 57 0 79l-77 77c-23 23-60 21-81-4L586 746c-20-24-56-27-80-8L425 801c-34 27-84 3-84-40V216c0-28 10-41 26-51Z" fill="#2F6BFF"/>
</svg>`;

const CONFIRMATION_TIMEOUT_MS = 10_000;

export class MinimalCursorWidget implements CursorHost {
  private hostElement!: HTMLDivElement;
  private cursorElement!: HTMLDivElement;
  private confirmElement!: HTMLDivElement;
  private bannerElement!: HTMLDivElement;
  private pendingConfirmation: { resolve: (confirmed: boolean) => void; timeoutId: ReturnType<typeof setTimeout> } | null =
    null;

  mount(): void {
    // Everything this widget injects lives under one data-skilly-widget host, because
    // buildDomDigest() filters out any element inside that attribute. Without it, Skilly's own
    // cursor and confirm buttons would be digested as page elements and offered to the model as
    // things to point at and click.
    this.hostElement = document.createElement("div");
    this.hostElement.setAttribute("data-skilly-widget", "");

    this.cursorElement = document.createElement("div");
    this.cursorElement.setAttribute("data-skilly-cursor", "");
    this.cursorElement.setAttribute("data-visible", "false");
    this.cursorElement.style.position = "fixed";
    this.cursorElement.style.top = "0";
    this.cursorElement.style.left = "0";
    this.cursorElement.style.zIndex = "2147483647";
    this.cursorElement.style.pointerEvents = "none";
    this.cursorElement.innerHTML = CURSOR_ICON;
    this.hostElement.appendChild(this.cursorElement);

    this.confirmElement = document.createElement("div");
    this.confirmElement.setAttribute("data-skilly-confirm", "");
    this.confirmElement.setAttribute("data-visible", "false");
    this.confirmElement.style.position = "fixed";
    this.confirmElement.style.zIndex = "2147483647";
    this.confirmElement.innerHTML = `
      <div data-skilly-confirm-copy></div>
      <button type="button" data-skilly-confirm-yes>Confirm</button>
      <button type="button" data-skilly-confirm-no>Cancel</button>
    `;
    this.confirmElement
      .querySelector("[data-skilly-confirm-yes]")
      ?.addEventListener("click", () => this.finishConfirmation(true));
    this.confirmElement
      .querySelector("[data-skilly-confirm-no]")
      ?.addEventListener("click", () => this.finishConfirmation(false));
    this.hostElement.appendChild(this.confirmElement);

    this.bannerElement = document.createElement("div");
    this.bannerElement.setAttribute("data-skilly-banner", "");
    this.bannerElement.setAttribute("data-visible", "false");
    this.bannerElement.style.position = "fixed";
    this.bannerElement.style.top = "16px";
    this.bannerElement.style.left = "50%";
    this.bannerElement.style.transform = "translateX(-50%)";
    this.bannerElement.style.zIndex = "2147483647";
    this.hostElement.appendChild(this.bannerElement);

    document.body.appendChild(this.hostElement);
  }

  showBanner(text: string): void {
    this.bannerElement.textContent = text;
    this.bannerElement.setAttribute("data-visible", "true");
  }

  hideBanner(): void {
    this.bannerElement.setAttribute("data-visible", "false");
  }

  showCursor(): void {
    this.cursorElement.setAttribute("data-visible", "true");
  }

  hideCursor(): void {
    this.cursorElement.setAttribute("data-visible", "false");
  }

  setCursorPosition(viewportX: number, viewportY: number): void {
    this.cursorElement.style.transform = `translate(${viewportX - 3}px, ${viewportY - 3}px)`;
  }

  confirmAction(label: string): Promise<boolean> {
    // Supersede any confirmation still on screen. Resolving it as declined (rather than dropping
    // it) matters: the ActionExecutor is awaiting that promise and would hang forever otherwise.
    this.finishConfirmation(false);

    const copy = this.confirmElement.querySelector("[data-skilly-confirm-copy]");
    if (copy) {
      copy.textContent = `Let Skilly act on "${label}"?`;
    }
    this.confirmElement.setAttribute("data-visible", "true");
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => this.finishConfirmation(false), CONFIRMATION_TIMEOUT_MS);
      this.pendingConfirmation = { resolve, timeoutId };
    });
  }

  private finishConfirmation(confirmed: boolean): void {
    const pending = this.pendingConfirmation;
    this.pendingConfirmation = null;
    this.confirmElement.setAttribute("data-visible", "false");
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutId);
    pending.resolve(confirmed);
  }

  destroy(): void {
    this.finishConfirmation(false);
    this.hostElement.remove();
  }
}
