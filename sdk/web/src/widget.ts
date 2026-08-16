// The embeddable companion UI, isolated in a Shadow DOM so it neither leaks
// styles into the host page nor inherits the host's CSS.

import type { CursorHost } from "@skilly/browser-core";
import { WIDGET_STYLES } from "./styles.js";
import type { ConversationMessage, GuidanceProgress } from "./sessionState.js";
import type { SkillyState } from "./types.js";
import {
  clampWidgetPanelPosition,
  parseWidgetPanelPosition,
  positionPointerCaption,
  shouldRevealWidgetHistory,
  type WidgetNotice,
  type WidgetPoint,
} from "./widgetState.js";

const SKILLY_MARK_ICON = /* html */ `
<svg class="skilly-launcher-mark" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M367 165c0-42 47-67 82-43l440 299c38 26 27 85-18 94l-118 24c-32 7-45 46-22 69l170 169c22 22 22 57 0 79l-77 77c-23 23-60 21-81-4L586 746c-20-24-56-27-80-8L425 801c-34 27-84 3-84-40V216c0-28 10-41 26-51Z" fill="currentColor"/>
</svg>`;

const CLOSE_ICON = /* html */ `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>
</svg>`;

const HISTORY_ICON = /* html */ `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <path d="M5 5.5h10M5 10h10M5 14.5h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/>
</svg>`;

const RESET_POSITION_ICON = /* html */ `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <path d="M6 6h8v8H6zM4 9V4h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/>
</svg>`;

const PANEL_POSITION_STORAGE_KEY = "skilly:web:panel-position:v1";

interface WidgetOptions {
  /** @deprecated The conversation panel is now fixed and draggable; spoken captions follow the pointer. */
  bubbleMode?: "follow" | "fixed";
  supportsTextInput?: boolean;
}

const STATE_LABELS: Record<SkillyState, string> = {
  idle: "Ready",
  consent: "Before we start",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  pointing: "Pointing",
  error: "Needs attention",
  quotaDisabled: "Session unavailable",
  micDenied: "Microphone blocked",
};

export class SkillyWidget implements CursorHost {
  private hostElement: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private launcherButton!: HTMLButtonElement;
  private launcherLabelElement!: HTMLDivElement;
  private bubbleElement!: HTMLDivElement;
  private bubbleHeaderElement!: HTMLDivElement;
  private bubbleStatusElement!: HTMLSpanElement;
  private bubbleMessageElement!: HTMLDivElement;
  private resetPositionButton!: HTMLButtonElement;
  private guidanceElement!: HTMLDivElement;
  private guidanceTitleElement!: HTMLDivElement;
  private guidanceSummaryElement!: HTMLSpanElement;
  private guidanceStepsElement!: HTMLOListElement;
  private historyToggleButton!: HTMLButtonElement;
  private historyCountElement!: HTMLSpanElement;
  private conversationElement!: HTMLDivElement;
  private conversationMessagesElement!: HTMLDivElement;
  private consentActionsElement!: HTMLDivElement;
  private noticeActionsElement!: HTMLDivElement;
  private retryButton!: HTMLButtonElement;
  private textFormElement!: HTMLFormElement;
  private textInputElement!: HTMLInputElement;
  private cursorElement!: HTMLDivElement;
  private pointerCaptionElement!: HTMLDivElement;
  private confirmElement!: HTMLDivElement;
  private currentState: SkillyState = "idle";
  private historyVisible = false;
  private conversationMessageCount = 0;
  private cursorVisible = false;
  private customPanelPosition: WidgetPoint | null = null;
  private panelDragState: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  private pendingConfirm: { resolve: (confirmed: boolean) => void; timeoutId: number } | null = null;
  private idleLauncherLabel: string;
  private readonly supportsTextInput: boolean;
  private skillyX = window.innerWidth - 48;
  private skillyY = window.innerHeight - 48;

  public onLauncherActivated: (() => void) | null = null;
  public onCloseRequested: (() => void) | null = null;
  public onRetryRequested: (() => void) | null = null;
  public onConsentAccepted: (() => void) | null = null;
  public onConsentDeclined: (() => void) | null = null;
  public onTextSubmitted: ((text: string) => void) | null = null;
  public onHistoryCleared: (() => void) | null = null;

  constructor(accentColor: string, launcherLabel?: string, options: WidgetOptions = {}) {
    this.idleLauncherLabel = launcherLabel?.trim() || "Ask Skilly";
    this.supportsTextInput = options.supportsTextInput === true;
    this.hostElement = document.createElement("div");
    this.hostElement.setAttribute("data-skilly-widget", "");
    this.shadowRoot = this.hostElement.attachShadow({ mode: "open" });

    const styleElement = document.createElement("style");
    styleElement.textContent = WIDGET_STYLES;
    this.shadowRoot.appendChild(styleElement);
    this.hostElement.style.setProperty("--skilly-accent", accentColor);

    this.renderLauncher();
    this.renderBubble();
    this.renderCursor();
    this.renderConfirmChip();
  }

  mount(): void {
    document.body.appendChild(this.hostElement);
    window.addEventListener("keydown", this.handleWindowKeyDown);
    window.addEventListener("resize", this.handleWindowResize);
    this.restorePanelPosition();
  }

  private renderLauncher(): void {
    const launcherShell = document.createElement("div");
    launcherShell.className = "skilly-launcher-shell";

    this.launcherLabelElement = document.createElement("div");
    this.launcherLabelElement.className = "skilly-launcher-label";
    this.launcherLabelElement.textContent = this.idleLauncherLabel;
    this.launcherLabelElement.setAttribute("role", "tooltip");
    launcherShell.appendChild(this.launcherLabelElement);

    this.launcherButton = document.createElement("button");
    this.launcherButton.type = "button";
    this.launcherButton.className = "skilly-launcher";
    this.launcherButton.setAttribute("aria-label", this.idleLauncherLabel);
    this.launcherButton.setAttribute("aria-describedby", "skilly-launcher-tooltip");
    this.launcherButton.setAttribute("data-state", "idle");
    this.launcherLabelElement.id = "skilly-launcher-tooltip";
    this.launcherButton.innerHTML = SKILLY_MARK_ICON;
    this.launcherButton.addEventListener("click", () => this.onLauncherActivated?.());
    launcherShell.appendChild(this.launcherButton);
    this.shadowRoot.appendChild(launcherShell);
  }

  private renderBubble(): void {
    this.bubbleElement = document.createElement("div");
    this.bubbleElement.className = "skilly-bubble";
    this.bubbleElement.hidden = true;
    this.bubbleElement.setAttribute("data-visible", "false");
    this.bubbleElement.setAttribute("data-state", "idle");
    this.bubbleElement.setAttribute("data-placement", "fixed");
    this.bubbleElement.setAttribute("data-position", "default");
    this.bubbleElement.setAttribute("role", "status");
    this.bubbleElement.setAttribute("aria-live", "polite");
    this.bubbleElement.innerHTML = /* html */ `
      <div class="skilly-bubble-header" title="Drag to move Skilly">
        <div class="skilly-status-lockup">
          <span class="skilly-status-dot" aria-hidden="true"></span>
          <span class="skilly-bubble-status">Ready</span>
        </div>
        <div class="skilly-header-actions">
          <button class="skilly-position-reset" type="button" aria-label="Reset Skilly panel position" title="Reset panel position" hidden>
            ${RESET_POSITION_ICON}
          </button>
          <button class="skilly-history-toggle" type="button" aria-label="Show session history" aria-pressed="false" hidden>
            ${HISTORY_ICON}<span class="skilly-history-count">0</span>
          </button>
          <button class="skilly-close" type="button" aria-label="Close Skilly">${CLOSE_ICON}</button>
        </div>
      </div>
      <section class="skilly-guidance" aria-label="Guided task progress" hidden>
        <div class="skilly-guidance-header">
          <div class="skilly-guidance-title"></div>
          <span class="skilly-guidance-summary"></span>
        </div>
        <ol class="skilly-guidance-steps"></ol>
      </section>
      <div class="skilly-bubble-message"></div>
      <section class="skilly-conversation" aria-label="Session history" hidden>
        <div class="skilly-conversation-header">
          <span>Session history</span>
          <button class="skilly-history-clear" type="button">Clear</button>
        </div>
        <div class="skilly-conversation-messages"></div>
      </section>
      <div class="skilly-activity" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="skilly-consent-actions" data-visible="false">
        <button class="skilly-button skilly-button-primary skilly-consent-start" type="button">Start with voice</button>
        <button class="skilly-button skilly-consent-cancel" type="button">Not now</button>
      </div>
      <div class="skilly-notice-actions" data-visible="false">
        <button class="skilly-button skilly-button-primary skilly-retry" type="button">Try again</button>
        <button class="skilly-button skilly-notice-close" type="button">Close</button>
      </div>
      <form class="skilly-text-form" data-visible="false">
        <label class="skilly-sr-only" for="skilly-text-input">Type a question for Skilly</label>
        <input id="skilly-text-input" class="skilly-text-input" type="text" maxlength="500" autocomplete="off" placeholder="Type instead…" />
        <button class="skilly-send" type="submit" aria-label="Send question">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>
        </button>
      </form>
      <a class="skilly-attribution" href="https://tryskilly.app?utm_source=skilly_widget&utm_medium=embedded_widget&utm_campaign=powered_by" target="_blank" rel="noopener noreferrer">Powered by Skilly</a>
    `;

    this.bubbleHeaderElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-bubble-header")!;
    this.bubbleStatusElement = this.bubbleElement.querySelector<HTMLSpanElement>(".skilly-bubble-status")!;
    this.bubbleMessageElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-bubble-message")!;
    this.resetPositionButton = this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-position-reset")!;
    this.guidanceElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-guidance")!;
    this.guidanceTitleElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-guidance-title")!;
    this.guidanceSummaryElement = this.bubbleElement.querySelector<HTMLSpanElement>(".skilly-guidance-summary")!;
    this.guidanceStepsElement = this.bubbleElement.querySelector<HTMLOListElement>(".skilly-guidance-steps")!;
    this.historyToggleButton = this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-history-toggle")!;
    this.historyCountElement = this.bubbleElement.querySelector<HTMLSpanElement>(".skilly-history-count")!;
    this.conversationElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-conversation")!;
    this.conversationMessagesElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-conversation-messages")!;
    this.consentActionsElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-consent-actions")!;
    this.noticeActionsElement = this.bubbleElement.querySelector<HTMLDivElement>(".skilly-notice-actions")!;
    this.retryButton = this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-retry")!;
    this.textFormElement = this.bubbleElement.querySelector<HTMLFormElement>(".skilly-text-form")!;
    this.textInputElement = this.bubbleElement.querySelector<HTMLInputElement>(".skilly-text-input")!;

    this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-close")?.addEventListener("click", () =>
      this.onCloseRequested?.(),
    );
    this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-consent-start")?.addEventListener("click", () =>
      this.onConsentAccepted?.(),
    );
    this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-consent-cancel")?.addEventListener("click", () =>
      this.onConsentDeclined?.(),
    );
    this.retryButton.addEventListener("click", () => this.onRetryRequested?.());
    this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-notice-close")?.addEventListener("click", () =>
      this.onCloseRequested?.(),
    );
    this.historyToggleButton.addEventListener("click", () => this.setHistoryVisible(!this.historyVisible));
    this.resetPositionButton.addEventListener("click", () => this.resetPanelPosition());
    this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-history-clear")?.addEventListener("click", () =>
      this.onHistoryCleared?.(),
    );
    this.bubbleHeaderElement.addEventListener("pointerdown", this.handlePanelPointerDown);
    this.bubbleHeaderElement.addEventListener("pointermove", this.handlePanelPointerMove);
    this.bubbleHeaderElement.addEventListener("pointerup", this.handlePanelPointerUp);
    this.bubbleHeaderElement.addEventListener("pointercancel", this.handlePanelPointerUp);
    this.textFormElement.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = this.textInputElement.value.trim();
      if (!text) {
        return;
      }
      this.onTextSubmitted?.(text);
      this.textInputElement.value = "";
    });

    this.shadowRoot.appendChild(this.bubbleElement);
  }

  private renderCursor(): void {
    this.cursorElement = document.createElement("div");
    this.cursorElement.className = "skilly-cursor";
    this.cursorElement.setAttribute("data-visible", "false");
    this.cursorElement.innerHTML = SKILLY_MARK_ICON;
    this.shadowRoot.appendChild(this.cursorElement);

    this.pointerCaptionElement = document.createElement("div");
    this.pointerCaptionElement.className = "skilly-pointer-caption";
    this.pointerCaptionElement.hidden = true;
    this.pointerCaptionElement.setAttribute("data-visible", "false");
    this.pointerCaptionElement.setAttribute("role", "status");
    this.pointerCaptionElement.setAttribute("aria-live", "polite");
    this.shadowRoot.appendChild(this.pointerCaptionElement);
  }

  private renderConfirmChip(): void {
    this.confirmElement = document.createElement("div");
    this.confirmElement.className = "skilly-confirm";
    this.confirmElement.hidden = true;
    this.confirmElement.setAttribute("data-visible", "false");
    this.confirmElement.innerHTML = /* html */ `
      <div class="skilly-confirm-copy"></div>
      <div class="skilly-confirm-actions">
        <button class="skilly-confirm-button skilly-confirm-primary" type="button">Confirm</button>
        <button class="skilly-confirm-button" type="button">Cancel</button>
      </div>
    `;
    this.confirmElement
      .querySelector<HTMLButtonElement>(".skilly-confirm-primary")
      ?.addEventListener("click", () => this.finishActionConfirmation(true));
    this.confirmElement
      .querySelectorAll<HTMLButtonElement>(".skilly-confirm-button")[1]
      ?.addEventListener("click", () => this.finishActionConfirmation(false));
    this.shadowRoot.appendChild(this.confirmElement);
  }

  setState(state: SkillyState): void {
    this.currentState = state;
    this.launcherButton.setAttribute("data-state", state);
    this.bubbleElement.setAttribute("data-state", state);
    this.bubbleStatusElement.textContent = STATE_LABELS[state];
    this.consentActionsElement.setAttribute("data-visible", state === "consent" ? "true" : "false");
    this.noticeActionsElement.setAttribute(
      "data-visible",
      state === "error" || state === "quotaDisabled" || state === "micDenied" ? "true" : "false",
    );
    const showTextInput =
      this.supportsTextInput && (state === "listening" || state === "speaking" || state === "pointing");
    this.textFormElement.setAttribute("data-visible", showTextInput ? "true" : "false");

    const launcherLabel = state === "idle" ? this.idleLauncherLabel : STATE_LABELS[state];
    this.launcherLabelElement.textContent = launcherLabel;
    this.launcherButton.setAttribute(
      "aria-label",
      state === "idle" ? this.idleLauncherLabel : `${STATE_LABELS[state]}. Open Skilly`,
    );

    if (state === "idle") {
      if (this.conversationMessageCount > 0) {
        this.showBubble();
      } else {
        this.hidePanel();
      }
    } else {
      this.showBubble();
    }
  }

  showConsent(consentText?: string): void {
    this.setState("consent");
    this.bubbleElement.setAttribute("role", "dialog");
    this.bubbleElement.setAttribute("aria-live", "off");
    this.bubbleMessageElement.textContent =
      consentText?.trim() ||
      "Skilly uses your microphone while the assistant is open so you can ask questions by voice. Audio stops when you close it.";
    this.repositionBubble();
    queueMicrotask(() =>
      this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-consent-start")?.focus(),
    );
  }

  showNotice(notice: WidgetNotice): void {
    this.setState(notice.state);
    this.bubbleElement.setAttribute("role", "alertdialog");
    this.bubbleElement.setAttribute("aria-live", "assertive");
    this.bubbleStatusElement.textContent = notice.title;
    this.bubbleMessageElement.textContent = notice.message;
    this.retryButton.hidden = !notice.retryable;
    this.repositionBubble();
    queueMicrotask(() => (notice.retryable ? this.retryButton : this.bubbleElement.querySelector<HTMLButtonElement>(".skilly-notice-close"))?.focus());
  }

  setBubbleText(text: string): void {
    this.bubbleElement.setAttribute("role", "status");
    this.bubbleElement.setAttribute("aria-live", "polite");
    this.bubbleMessageElement.textContent = text;
    if (text) {
      this.showBubble();
    } else if (this.currentState === "idle" && this.conversationMessageCount === 0) {
      this.hidePanel();
    }
  }

  setPointerCaption(text: string): void {
    this.pointerCaptionElement.textContent = text;
    this.updatePointerCaptionVisibility();
  }

  hidePanel(): void {
    this.bubbleElement.setAttribute("data-visible", "false");
    this.bubbleElement.hidden = true;
    this.setPointerCaption("");
  }

  setConversation(messages: ConversationMessage[]): void {
    const shouldRevealFirstMessage = shouldRevealWidgetHistory(
      this.conversationMessageCount,
      messages.length,
      window.innerWidth,
    );
    this.conversationMessageCount = messages.length;
    this.historyToggleButton.hidden = messages.length === 0;
    this.historyCountElement.textContent = String(messages.length);
    this.conversationMessagesElement.replaceChildren();

    for (const message of messages) {
      const messageElement = document.createElement("article");
      messageElement.className = "skilly-conversation-message";
      messageElement.setAttribute("data-role", message.role);

      const roleElement = document.createElement("div");
      roleElement.className = "skilly-conversation-role";
      roleElement.textContent = message.role === "user" ? "You" : "Skilly";

      const textElement = document.createElement("div");
      textElement.className = "skilly-conversation-text";
      textElement.textContent = message.text;

      messageElement.append(roleElement, textElement);
      this.conversationMessagesElement.appendChild(messageElement);
    }

    if (messages.length === 0) {
      this.setHistoryVisible(false);
      if (this.currentState === "idle") {
        this.hidePanel();
      }
      return;
    }
    if (shouldRevealFirstMessage) {
      this.setHistoryVisible(true);
    }
    queueMicrotask(() => {
      this.conversationMessagesElement.scrollTop = this.conversationMessagesElement.scrollHeight;
      this.repositionBubble();
    });
  }

  setGuidanceProgress(guidance: GuidanceProgress | null): void {
    this.guidanceStepsElement.replaceChildren();
    if (!guidance) {
      this.guidanceElement.hidden = true;
      return;
    }

    this.guidanceElement.hidden = false;
    this.guidanceTitleElement.textContent = guidance.title;
    this.guidanceSummaryElement.textContent =
      guidance.status === "completed" ? "Completed" : `Step ${guidance.currentStep} of ${guidance.steps.length}`;

    guidance.steps.forEach((step, index) => {
      const stepNumber = index + 1;
      const stepState = guidance.status === "completed" || stepNumber < guidance.currentStep
        ? "complete"
        : stepNumber === guidance.currentStep
          ? "current"
          : "upcoming";
      const stepElement = document.createElement("li");
      stepElement.className = "skilly-guidance-step";
      stepElement.setAttribute("data-step-state", stepState);

      const markerElement = document.createElement("span");
      markerElement.className = "skilly-guidance-marker";
      markerElement.textContent = stepState === "complete" ? "✓" : String(stepNumber);
      markerElement.setAttribute("aria-hidden", "true");

      const labelElement = document.createElement("span");
      labelElement.className = "skilly-guidance-label";
      labelElement.textContent = step;
      stepElement.append(markerElement, labelElement);
      this.guidanceStepsElement.appendChild(stepElement);
    });
    this.repositionBubble();
  }

  private setHistoryVisible(visible: boolean): void {
    this.historyVisible = visible && this.conversationMessageCount > 0;
    this.conversationElement.hidden = !this.historyVisible;
    this.historyToggleButton.setAttribute("aria-pressed", this.historyVisible ? "true" : "false");
    this.historyToggleButton.setAttribute(
      "aria-label",
      this.historyVisible ? "Hide session history" : "Show session history",
    );
    this.repositionBubble();
  }

  private showBubble(): void {
    this.bubbleElement.hidden = false;
    this.repositionBubble();
    this.bubbleElement.setAttribute("data-visible", "true");
  }

  focusLauncher(): void {
    this.launcherButton.focus();
  }

  setSkillyPosition(x: number, y: number): void {
    this.skillyX = x;
    this.skillyY = y;
    this.repositionPointerCaption();
    if (this.confirmElement.getAttribute("data-visible") === "true") {
      this.repositionConfirmChip();
    }
  }

  private repositionBubble(): void {
    this.bubbleElement.style.transform = "";
    if (!this.customPanelPosition) {
      return;
    }
    this.applyPanelPosition(this.customPanelPosition, false);
  }

  private applyPanelPosition(position: WidgetPoint, shouldPersist: boolean): void {
    const panelPosition = clampWidgetPanelPosition(
      position,
      {
        width: this.bubbleElement.offsetWidth || Math.min(380, window.innerWidth - 32),
        height: this.bubbleElement.offsetHeight || 280,
      },
      { width: window.innerWidth, height: window.innerHeight },
    );
    this.customPanelPosition = panelPosition;
    this.bubbleElement.style.left = `${panelPosition.x}px`;
    this.bubbleElement.style.top = `${panelPosition.y}px`;
    this.bubbleElement.style.right = "auto";
    this.bubbleElement.style.bottom = "auto";
    this.bubbleElement.setAttribute("data-position", "custom");
    this.resetPositionButton.hidden = false;
    if (shouldPersist) {
      this.persistPanelPosition(panelPosition);
    }
  }

  private restorePanelPosition(): void {
    let storedPosition: WidgetPoint | null = null;
    try {
      storedPosition = parseWidgetPanelPosition(window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY));
    } catch {
      storedPosition = null;
    }
    if (storedPosition) {
      this.applyPanelPosition(storedPosition, false);
    }
  }

  private persistPanelPosition(position: WidgetPoint): void {
    try {
      window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      // Embeds can run in storage-restricted contexts; dragging still works for this page.
    }
  }

  private resetPanelPosition(): void {
    this.customPanelPosition = null;
    this.bubbleElement.style.left = "";
    this.bubbleElement.style.top = "";
    this.bubbleElement.style.right = "";
    this.bubbleElement.style.bottom = "";
    this.bubbleElement.setAttribute("data-position", "default");
    this.resetPositionButton.hidden = true;
    try {
      window.localStorage.removeItem(PANEL_POSITION_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions; the visual reset already succeeded.
    }
  }

  private handlePanelPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, a, input")) {
      return;
    }
    const panelBounds = this.bubbleElement.getBoundingClientRect();
    this.panelDragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelBounds.left,
      offsetY: event.clientY - panelBounds.top,
    };
    this.bubbleElement.setAttribute("data-dragging", "true");
    this.bubbleHeaderElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private handlePanelPointerMove = (event: PointerEvent): void => {
    if (!this.panelDragState || this.panelDragState.pointerId !== event.pointerId) {
      return;
    }
    this.applyPanelPosition(
      {
        x: event.clientX - this.panelDragState.offsetX,
        y: event.clientY - this.panelDragState.offsetY,
      },
      false,
    );
  };

  private handlePanelPointerUp = (event: PointerEvent): void => {
    if (!this.panelDragState || this.panelDragState.pointerId !== event.pointerId) {
      return;
    }
    this.panelDragState = null;
    this.bubbleElement.removeAttribute("data-dragging");
    if (this.bubbleHeaderElement.hasPointerCapture(event.pointerId)) {
      this.bubbleHeaderElement.releasePointerCapture(event.pointerId);
    }
    if (this.customPanelPosition) {
      this.persistPanelPosition(this.customPanelPosition);
    }
  };

  private updatePointerCaptionVisibility(): void {
    const captionHasText = this.pointerCaptionElement.textContent?.trim().length !== 0;
    const captionIsVisible = this.cursorVisible && captionHasText;
    this.pointerCaptionElement.hidden = !captionIsVisible;
    this.pointerCaptionElement.setAttribute("data-visible", captionIsVisible ? "true" : "false");
    if (captionIsVisible) {
      this.repositionPointerCaption();
    }
  }

  private repositionPointerCaption(): void {
    if (this.pointerCaptionElement.hidden) {
      return;
    }
    const captionPosition = positionPointerCaption(
      { x: this.skillyX, y: this.skillyY },
      {
        width: this.pointerCaptionElement.offsetWidth || Math.min(280, window.innerWidth - 32),
        height: this.pointerCaptionElement.offsetHeight || 96,
      },
      { width: window.innerWidth, height: window.innerHeight },
    );
    this.pointerCaptionElement.style.transform = `translate(${captionPosition.x}px, ${captionPosition.y}px)`;
  }

  showCursor(): void {
    this.cursorVisible = true;
    this.cursorElement.setAttribute("data-visible", "true");
    this.updatePointerCaptionVisibility();
  }

  setCursorPosition(viewportX: number, viewportY: number): void {
    this.cursorElement.style.transform = `translate(${viewportX - 3}px, ${viewportY - 3}px)`;
    this.setSkillyPosition(viewportX, viewportY);
  }

  hideCursor(): void {
    this.cursorVisible = false;
    this.cursorElement.setAttribute("data-visible", "false");
    this.updatePointerCaptionVisibility();
  }

  showActionConfirmation(label: string): Promise<boolean> {
    this.finishActionConfirmation(false);
    const copy = this.confirmElement.querySelector<HTMLDivElement>(".skilly-confirm-copy");
    if (copy) {
      copy.textContent = `Let Skilly act on “${label}”?`;
    }
    this.confirmElement.hidden = false;
    this.repositionConfirmChip();
    this.confirmElement.setAttribute("data-visible", "true");
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => this.finishActionConfirmation(false), 10_000);
      this.pendingConfirm = { resolve, timeoutId };
    });
  }

  cancelActionConfirmation(): void {
    this.finishActionConfirmation(false);
  }

  private finishActionConfirmation(confirmed: boolean): void {
    const pendingConfirm = this.pendingConfirm;
    this.pendingConfirm = null;
    this.confirmElement?.setAttribute("data-visible", "false");
    this.confirmElement.hidden = true;
    if (!pendingConfirm) {
      return;
    }
    window.clearTimeout(pendingConfirm.timeoutId);
    pendingConfirm.resolve(confirmed);
  }

  private repositionConfirmChip(): void {
    const chipWidth = Math.min(300, window.innerWidth - 32);
    const chipHeight = this.confirmElement.offsetHeight || 76;
    const edge = 16;
    let x = this.skillyX + 22;
    let y = this.skillyY + 42;

    if (x + chipWidth > window.innerWidth - edge) {
      x = this.skillyX - chipWidth - 22;
    }
    if (y + chipHeight > window.innerHeight - edge) {
      y = this.skillyY - chipHeight - 16;
    }
    x = Math.max(edge, Math.min(window.innerWidth - chipWidth - edge, x));
    y = Math.max(edge, Math.min(window.innerHeight - chipHeight - edge, y));
    this.confirmElement.style.transform = `translate(${x}px, ${y}px)`;
  }

  private handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }
    if (this.confirmElement.getAttribute("data-visible") === "true") {
      this.cancelActionConfirmation();
      return;
    }
    if (this.currentState !== "idle") {
      this.onCloseRequested?.();
    }
  };

  private handleWindowResize = (): void => {
    this.repositionBubble();
    this.repositionPointerCaption();
    if (this.confirmElement.getAttribute("data-visible") === "true") {
      this.repositionConfirmChip();
    }
  };

  destroy(): void {
    window.removeEventListener("keydown", this.handleWindowKeyDown);
    window.removeEventListener("resize", this.handleWindowResize);
    this.cancelActionConfirmation();
    this.hostElement.remove();
  }
}
