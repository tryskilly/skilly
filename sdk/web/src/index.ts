// @skilly/web — public entry point.
//
// Usage (script embed):
//   <script src="https://cdn.tryskilly.app/web/v1.js"
//           data-skilly-key="pk_live_..." data-skilly-skill="acme-onboarding" defer></script>
//
// Usage (npm):
//   import { init, start, on } from "@skilly/web";
//   init({ key: "pk_live_...", skill: "acme-onboarding" });
//
// 8.1 is the embed SKELETON: it mounts the Shadow-DOM widget and runs a
// simulated turn lifecycle so the flow is visible end-to-end. The real DOM
// digest + selector pointing (8.2), voice pipeline (8.3), and multi-tenant
// backend (8.4+) are layered on next.

import { SkillyWidget } from "./widget.js";
import { fetchSessionToken, fetchTenantSkill, reportSessionUsage } from "./token.js";
import { presentWidgetError, QUOTA_DISABLED_NOTICE } from "./widgetState.js";
import {
  parseGuidanceProgress,
  WidgetSessionStore,
  type SessionStorageAdapter,
} from "./sessionState.js";
import {
  loadCore,
  buildDomDigest,
  type DomDigest,
  type ElementRegistry,
  inferPointFromText,
  parsePointTags,
  PointingEngine,
  buildCompanionInstructions,
  RealtimeSession,
  type RealtimeActionToolCall,
  type RealtimeGuidanceProgressToolCall,
  type RealtimeState,
  ActionExecutor,
  parseActionRequest,
  type ActionResult,
} from "@skilly/browser-core";
import type {
  SkillyConfig,
  SkillyEventHandler,
  SkillyEventMap,
  SkillyEventName,
} from "./types.js";

const DEFAULT_ACCENT = "#F59E0B";

function getSessionStorage(): SessionStorageAdapter | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

class SkillyController {
  private config: SkillyConfig | null = null;
  private widget: SkillyWidget | null = null;
  private pointing: PointingEngine | null = null;
  private currentDigest: DomDigest | null = null;
  private currentRegistry: ElementRegistry | null = null;
  // Storage is type-erased; the public on()/emit() signatures keep callers type-safe.
  private handlers = new Map<SkillyEventName, Set<(payload: never) => void>>();
  private turnInProgress = false;
  private simulatedTurnGeneration = 0;

  // Live (8.3) vs. simulated (no backend) mode.
  private liveMode = false;
  private realtimeSession: RealtimeSession | null = null;
  private actionExecutor: ActionExecutor | null = null;
  private liveActive = false;
  private liveSessionStartedAt = 0;
  private liveSessionGeneration = 0;
  private liveSessionCapTimer: number | null = null;
  private liveActionsExecuted = 0;
  private liveActionsRefused = 0;
  private liveAudioPlaying = false;
  private lastPointedTarget: string | null = null;
  private microphoneConsentGranted = false;
  private pendingLiveGoal: string | undefined;
  private lastLiveGoal: string | undefined;
  private identifiedEndUser: { id: string; traits?: Record<string, unknown> } | null = null;
  private sessionStore: WidgetSessionStore | null = null;
  private activeAssistantMessageId: string | null = null;

  init(config: SkillyConfig): void {
    if (this.widget) {
      console.warn("[skilly] already initialized; call destroy() first to re-init.");
      return;
    }
    if (typeof document !== "undefined" && document.querySelector("[data-skilly-widget]")) {
      console.warn("[skilly] widget already exists on this page; skipping duplicate init.");
      return;
    }
    if (!config.key) {
      console.error("[skilly] init() requires a publishable `key`.");
      return;
    }
    this.config = config;
    // Voice pipeline is enabled when a backend (token source) is configured.
    this.liveMode = Boolean(config.backendUrl);

    this.widget = new SkillyWidget(config.accentColor ?? DEFAULT_ACCENT, config.launcherLabel, {
      bubbleMode: config.bubbleMode,
      supportsTextInput: this.liveMode,
    });
    this.widget.onLauncherActivated = () => this.start();
    this.widget.onCloseRequested = () => this.closeWidget();
    this.widget.onRetryRequested = () => this.retryLiveSession();
    this.widget.onConsentAccepted = () => this.acceptMicrophoneConsent();
    this.widget.onConsentDeclined = () => this.declineMicrophoneConsent();
    this.widget.onTextSubmitted = (text) => this.submitTypedQuestion(text);
    this.widget.onHistoryCleared = () => this.clearSessionHistory();
    this.widget.mount();
    this.sessionStore = new WidgetSessionStore(getSessionStorage(), config.key, config.skill);
    this.renderSessionState();
    this.pointing = new PointingEngine(this.widget);

    // Begin loading the shared WASM core in the background (optional).
    void loadCore(config.coreUrl);
  }

  /**
   * Snapshot the host page as a DOM digest — the structured, screenshot-free
   * view the companion reasons over (and references in [POINT:id] tags). The
   * AI integration that consumes this lands in Phase 8.3.
   */
  getPageDigest(): DomDigest {
    const { digest, registry } = buildDomDigest();
    this.currentDigest = digest;
    this.currentRegistry = registry;
    return digest;
  }

  /**
   * Open the companion and run a turn. 8.1 simulates the lifecycle
   * (listening -> thinking -> speaking -> complete) so the embed is
   * demonstrable; 8.3 replaces this with the OpenAI Realtime voice pipeline.
   */
  start(goal?: string): void {
    if (!this.widget || !this.pointing) {
      return;
    }
    // Live mode: the launcher toggles a continuous Realtime voice session.
    if (this.liveMode) {
      if (!this.microphoneConsentGranted) {
        this.pendingLiveGoal = goal;
        this.lastLiveGoal = goal;
        this.widget.showConsent(this.config?.microphoneConsentText);
        return;
      }
      void this.toggleLiveSession(goal);
      return;
    }
    // Simulated mode (no backend configured) — keeps the embed demonstrable.
    if (this.turnInProgress) {
      return;
    }
    this.turnInProgress = true;
    const simulatedTurnGeneration = ++this.simulatedTurnGeneration;
    this.emit("turn", { goal });

    // Capture the page as a DOM digest at the start of the turn.
    const digest = this.getPageDigest();

    this.widget.setState("listening");
    this.widget.setBubbleText("Listening…");
    this.widget.setPointerCaption("");

    window.setTimeout(() => {
      if (simulatedTurnGeneration !== this.simulatedTurnGeneration) {
        return;
      }
      this.widget?.setState("thinking");
      this.widget?.setBubbleText("Thinking…");
    }, 800);

    window.setTimeout(() => {
      if (simulatedTurnGeneration === this.simulatedTurnGeneration) {
        void this.respondAndPoint(goal, digest, simulatedTurnGeneration);
      }
    }, 1600);

    window.setTimeout(() => {
      if (simulatedTurnGeneration !== this.simulatedTurnGeneration) {
        return;
      }
      this.widget?.setState("idle");
      this.widget?.setBubbleText("");
      this.widget?.setPointerCaption("");
      this.pointing?.clear();
      this.turnInProgress = false;
      this.emit("complete", {});
    }, 4200);
  }

  /**
   * 8.2: simulate the companion's response (which, from 8.3, will come from the
   * AI over the Realtime connection) and run its `[POINT:id:label]` tag through
   * the real pointing engine against the live DOM.
   */
  private async respondAndPoint(
    goal: string | undefined,
    digest: DomDigest,
    simulatedTurnGeneration: number,
  ): Promise<void> {
    if (!this.widget || !this.pointing) {
      return;
    }
    this.widget.setState("speaking");

    // Pick a real, demonstrable target: an authored annotation, else a heading.
    const target =
      digest.elements.find((element) => !/^el_\d+$/.test(element.id)) ??
      digest.elements.find((element) => element.role === "heading") ??
      digest.elements[0];

    const intro = goal ? `Let's start with "${goal}".` : "Hi! I'm Skilly.";
    const simulatedResponse = target
      ? `${intro} ${target.label} is right here. [POINT:${target.id}:${target.label}]`
      : `${intro} Ask me how to do anything on this site and I'll point you to it.`;

    const { cleanedText, points } = parsePointTags(simulatedResponse);
    this.widget.setBubbleText(cleanedText);
    this.widget.setPointerCaption(cleanedText);
    if (goal) {
      this.sessionStore?.appendMessage("user", goal);
    }
    this.sessionStore?.upsertAssistantMessage(
      `simulated-${simulatedTurnGeneration}`,
      cleanedText,
    );
    this.renderSessionState();

    const firstPoint = points[0];
    if (firstPoint) {
      this.widget.setState("pointing");
      const resolved = await this.pointing.pointAt(
        firstPoint.target,
        firstPoint.label,
        this.currentRegistry ?? undefined,
      );
      if (simulatedTurnGeneration !== this.simulatedTurnGeneration) {
        return;
      }
      this.widget.setState("speaking");
      if (resolved) {
        this.emit("point", { selector: firstPoint.target, label: resolved.label });
      }
    }
  }

  // ----- Live voice mode (Phase 8.3) ---------------------------------------

  /** Toggle the continuous Realtime session: connect if idle, stop if active. */
  private async toggleLiveSession(goal?: string): Promise<void> {
    if (this.liveActive) {
      this.stopLiveSession();
      return;
    }
    const config = this.config;
    if (!this.widget || !config || !config.backendUrl) {
      return;
    }
    const backendUrl = config.backendUrl;

    this.liveActive = true;
    this.lastLiveGoal = goal;
    const generation = ++this.liveSessionGeneration;
    this.liveSessionStartedAt = Date.now();
    this.liveActionsExecuted = 0;
    this.liveActionsRefused = 0;
    this.emit("turn", { goal });
    this.widget.setState("connecting");
    this.widget.setBubbleText("Getting Skilly ready…");
    this.widget.setPointerCaption("");

    try {
      // Capture the page + fetch the tenant's token and skill in parallel.
      const digest = this.getPageDigest();
      const [token, skillContent] = await Promise.all([
        fetchSessionToken({ backendUrl, publishableKey: config.key }),
        config.skill
          ? fetchTenantSkill({ backendUrl, publishableKey: config.key, skillId: config.skill }).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!this.liveActive || generation !== this.liveSessionGeneration) {
        return;
      }
      this.scheduleGuestSessionCap(token.guestSessionCapSeconds, generation);

      const instructions = buildCompanionInstructions({ skillContent, digest });
      const actionsEnabled = resolveLiveActionsEnabled({
        serverActionsEnabled: token.actionsEnabled,
        localActions: config.actions,
      });
      const actionExecutor =
        actionsEnabled && this.pointing
          ? new ActionExecutor({
              getRegistry: () => this.currentRegistry,
              pointing: this.pointing,
              confirm: ({ elementLabel }) => this.widget?.showActionConfirmation(elementLabel) ?? Promise.resolve(false),
              isSessionActive: () => this.liveActive && generation === this.liveSessionGeneration,
            })
          : null;
      this.actionExecutor = actionExecutor;
      const realtimeSession = new RealtimeSession({
        clientSecret: token.clientSecret,
        model: token.model,
        instructions,
        actions: actionsEnabled,
        callbacks: {
          onStateChange: (state) => {
            if (generation === this.liveSessionGeneration) {
              this.onRealtimeState(state);
            }
          },
          onUserTranscript: (text) => {
            if (generation === this.liveSessionGeneration) {
              actionExecutor?.resetTurnLimit();
              this.sessionStore?.appendMessage("user", text);
              this.renderSessionState();
            }
          },
          onResponseCreated: () => {
            if (generation !== this.liveSessionGeneration) {
              return;
            }
            this.lastPointedTarget = null;
            this.liveAudioPlaying = false;
            this.activeAssistantMessageId = `assistant-${generation}-${Date.now()}`;
            this.pointing?.clear();
            this.widget?.setState("thinking");
            this.widget?.setBubbleText("Thinking…");
            this.widget?.setPointerCaption("");
          },
          onAudioPlaybackStarted: () => {
            if (generation !== this.liveSessionGeneration) {
              return;
            }
            this.liveAudioPlaying = true;
            this.widget?.setState("speaking");
          },
          onAudioPlaybackEnded: () => {
            if (generation !== this.liveSessionGeneration) {
              return;
            }
            this.liveAudioPlaying = false;
            if (this.liveActive) {
              this.widget?.setState("listening");
            }
          },
          onAssistantText: (text) => {
            if (generation === this.liveSessionGeneration) {
              this.onAssistantText(text, generation);
            }
          },
          onResponseDone: () => {
            if (generation === this.liveSessionGeneration) {
              this.activeAssistantMessageId = null;
            }
          },
          onActionToolCall: (call) => {
            if (generation === this.liveSessionGeneration) {
              void this.onActionToolCall(call, generation, realtimeSession, actionExecutor);
            }
          },
          onGuidanceProgressToolCall: (call) => {
            if (generation === this.liveSessionGeneration) {
              this.onGuidanceProgressToolCall(call, generation, realtimeSession);
            }
          },
          onError: (message, cause) => {
            if (generation !== this.liveSessionGeneration) {
              return;
            }
            this.handleLiveSessionError(cause ?? message, message, generation);
          },
        },
      });
      this.realtimeSession = realtimeSession;
      await realtimeSession.connect();
      if (!this.liveActive || generation !== this.liveSessionGeneration) {
        realtimeSession.close();
        if (this.realtimeSession === realtimeSession) {
          this.realtimeSession = null;
        }
        if (this.actionExecutor === actionExecutor) {
          actionExecutor?.close();
          this.actionExecutor = null;
        }
      }
    } catch (sessionError) {
      if (generation !== this.liveSessionGeneration) {
        return;
      }
      const message = sessionError instanceof Error ? sessionError.message : "couldn't start session";
      this.handleLiveSessionError(sessionError, message, generation);
    }
  }

  private onRealtimeState(state: RealtimeState): void {
    if (!this.widget) {
      return;
    }
    if (state === "connecting") {
      this.widget.setState("connecting");
    } else if (state === "live") {
      this.widget.setState("listening");
      this.widget.setBubbleText("Listening… ask me anything.");
    }
  }

  /** Each assistant text update: show it, and drive any new [POINT] tag. */
  private onAssistantText(fullText: string, generation?: number): void {
    if (!this.widget || !this.pointing) {
      return;
    }
    this.widget.setState("speaking");
    const { cleanedText, points } = parsePointTags(fullText);
    this.widget.setBubbleText("");
    this.widget.setPointerCaption(cleanedText);
    if (cleanedText && this.activeAssistantMessageId) {
      this.sessionStore?.upsertAssistantMessage(this.activeAssistantMessageId, cleanedText);
      this.renderSessionState();
    }

    const point = points[0] ?? inferPointFromText(cleanedText, this.currentDigest);
    if (point && point.target !== this.lastPointedTarget) {
      this.lastPointedTarget = point.target;
      this.widget.setState("pointing");
      void this.pointing
        .pointAt(point.target, point.label, this.currentRegistry ?? undefined)
        .then((resolved) => {
          if (generation !== undefined && generation !== this.liveSessionGeneration) {
            return;
          }
          if (resolved) {
            this.emit("point", { selector: point.target, label: resolved.label });
          }
          if (this.liveActive) {
            this.widget?.setState(this.liveAudioPlaying ? "speaking" : "listening");
          }
        });
    }
  }

  private onGuidanceProgressToolCall(
    call: RealtimeGuidanceProgressToolCall,
    generation: number,
    realtimeSession: RealtimeSession,
  ): void {
    if (!this.liveActive || generation !== this.liveSessionGeneration || this.realtimeSession !== realtimeSession) {
      return;
    }
    let guidance = null;
    try {
      guidance = parseGuidanceProgress(JSON.parse(call.argumentsJson));
    } catch {
      guidance = null;
    }
    if (!guidance) {
      realtimeSession.sendFunctionCallOutput(call.callId, JSON.stringify({ ok: false, error: "invalid_progress" }));
      return;
    }
    this.sessionStore?.setGuidanceProgress(guidance);
    this.renderSessionState();
    realtimeSession.sendFunctionCallOutput(call.callId, JSON.stringify({ ok: true }));
  }

  private async onActionToolCall(
    call: RealtimeActionToolCall,
    generation: number,
    realtimeSession: RealtimeSession,
    actionExecutor: ActionExecutor | null,
  ): Promise<void> {
    if (!this.liveActive || generation !== this.liveSessionGeneration || !actionExecutor) {
      return;
    }

    const result = await this.executeActionToolCall(call, actionExecutor);
    this.recordActionResult(result);
    if (!this.liveActive || generation !== this.liveSessionGeneration || this.realtimeSession !== realtimeSession) {
      return;
    }
    realtimeSession.sendFunctionCallOutput(call.callId, JSON.stringify(result));
  }

  private async executeActionToolCall(
    call: RealtimeActionToolCall,
    actionExecutor: ActionExecutor,
  ): Promise<ActionResult> {
    let parsedArguments: unknown;
    try {
      parsedArguments = JSON.parse(call.argumentsJson);
    } catch {
      return { ok: false, error: "unsupported_target" };
    }
    const request = parseActionRequest(parsedArguments);
    if (!request) {
      return { ok: false, error: "unsupported_target" };
    }
    try {
      return await actionExecutor.execute(request);
    } catch {
      return { ok: false, error: "unsupported_target" };
    }
  }

  private stopLiveSession(options: { resetWidget?: boolean; emitComplete?: boolean } = {}): void {
    const resetWidget = options.resetWidget !== false;
    const emitComplete = options.emitComplete !== false;
    const sessionWasActive = this.liveActive || this.realtimeSession !== null;
    this.liveSessionGeneration += 1;
    this.clearGuestSessionCapTimer();
    this.actionExecutor?.close();
    this.actionExecutor = null;
    this.widget?.cancelActionConfirmation();
    this.realtimeSession?.close();
    this.realtimeSession = null;
    this.liveActive = false;
    this.liveAudioPlaying = false;
    this.lastPointedTarget = null;
    this.pointing?.clear();
    if (resetWidget) {
      this.widget?.setState("idle");
      this.widget?.setBubbleText("");
      this.widget?.setPointerCaption("");
      this.widget?.focusLauncher();
    }

    // Meter the session's seconds (best-effort, Phase 8.6).
    const elapsedSeconds = this.liveSessionStartedAt ? (Date.now() - this.liveSessionStartedAt) / 1000 : 0;
    const actionsExecuted = this.liveActionsExecuted;
    const actionsRefused = this.liveActionsRefused;
    this.liveSessionStartedAt = 0;
    this.liveActionsExecuted = 0;
    this.liveActionsRefused = 0;
    if (this.config?.backendUrl && elapsedSeconds > 0) {
      void reportSessionUsage({
        backendUrl: this.config.backendUrl,
        publishableKey: this.config.key,
        seconds: elapsedSeconds,
        actionsExecuted,
        actionsRefused,
        endUserId: this.identifiedEndUser?.id,
      });
    }

    if (emitComplete && sessionWasActive) {
      this.emit("complete", {});
    }
  }

  private handleLiveSessionError(
    error: unknown,
    technicalMessage: string,
    generation: number,
  ): void {
    if (generation !== this.liveSessionGeneration) {
      return;
    }
    const notice = presentWidgetError(error, technicalMessage);
    this.stopLiveSession({ resetWidget: false, emitComplete: false });
    this.widget?.showNotice(notice);
    this.emit("error", { message: technicalMessage });
  }

  private acceptMicrophoneConsent(): void {
    this.microphoneConsentGranted = true;
    const goal = this.pendingLiveGoal;
    this.pendingLiveGoal = undefined;
    void this.toggleLiveSession(goal);
  }

  private declineMicrophoneConsent(): void {
    this.pendingLiveGoal = undefined;
    this.widget?.setState("idle");
    this.widget?.hidePanel();
    this.widget?.focusLauncher();
  }

  private retryLiveSession(): void {
    if (!this.microphoneConsentGranted) {
      this.widget?.showConsent(this.config?.microphoneConsentText);
      return;
    }
    void this.toggleLiveSession(this.lastLiveGoal);
  }

  private submitTypedQuestion(text: string): void {
    if (!this.liveActive || !this.realtimeSession?.sendText(text)) {
      return;
    }
    this.actionExecutor?.resetTurnLimit();
    this.sessionStore?.appendMessage("user", text);
    this.renderSessionState();
    this.widget?.setState("thinking");
    this.widget?.setBubbleText("Thinking…");
    this.widget?.setPointerCaption("");
  }

  private renderSessionState(): void {
    const snapshot = this.sessionStore?.snapshot();
    this.widget?.setConversation(snapshot?.messages ?? []);
    this.widget?.setGuidanceProgress(snapshot?.guidance ?? null);
  }

  private clearSessionHistory(): void {
    this.sessionStore?.clear();
    this.activeAssistantMessageId = null;
    this.renderSessionState();
  }

  private closeWidget(): void {
    this.pendingLiveGoal = undefined;
    if (this.liveActive || this.realtimeSession) {
      this.stopLiveSession();
      this.widget?.hidePanel();
      return;
    }
    const simulatedTurnWasActive = this.turnInProgress;
    this.simulatedTurnGeneration += 1;
    this.turnInProgress = false;
    this.pointing?.clear();
    this.widget?.setState("idle");
    this.widget?.setBubbleText("");
    this.widget?.hidePanel();
    this.widget?.focusLauncher();
    if (simulatedTurnWasActive) {
      this.emit("complete", {});
    }
  }

  /** Subscribe to a companion event. Returns an unsubscribe function. */
  on<Name extends SkillyEventName>(event: Name, handler: SkillyEventHandler<Name>): () => void {
    let handlerSet = this.handlers.get(event);
    if (!handlerSet) {
      handlerSet = new Set();
      this.handlers.set(event, handlerSet);
    }
    const erasedHandler = handler as (payload: never) => void;
    handlerSet.add(erasedHandler);
    return () => {
      handlerSet?.delete(erasedHandler);
    };
  }

  /** Associate the current end-user with the tenant (analytics — wired in 8.4+). */
  identify(endUserId: string, traits?: Record<string, unknown>): void {
    const trimmedId = endUserId.trim();
    if (!trimmedId) {
      return;
    }
    this.identifiedEndUser = { id: trimmedId, traits };
  }

  /** Tear down the widget and clear subscriptions. */
  destroy(): void {
    this.realtimeSession?.close();
    this.realtimeSession = null;
    this.actionExecutor?.close();
    this.actionExecutor = null;
    this.liveActive = false;
    this.liveAudioPlaying = false;
    this.liveSessionGeneration += 1;
    this.clearGuestSessionCapTimer();
    this.liveActionsExecuted = 0;
    this.liveActionsRefused = 0;
    this.pointing?.clear();
    this.pointing = null;
    this.currentRegistry = null;
    this.currentDigest = null;
    this.widget?.destroy();
    this.widget = null;
    this.config = null;
    this.identifiedEndUser = null;
    this.sessionStore = null;
    this.activeAssistantMessageId = null;
    this.handlers.clear();
    this.turnInProgress = false;
    this.simulatedTurnGeneration += 1;
    this.microphoneConsentGranted = false;
    this.pendingLiveGoal = undefined;
    this.lastLiveGoal = undefined;
  }

  private emit<Name extends SkillyEventName>(event: Name, payload: SkillyEventMap[Name]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        (handler as (payload: SkillyEventMap[Name]) => void)(payload);
      } catch (handlerError) {
        console.error("[skilly] event handler threw:", handlerError);
      }
    });
  }

  private recordActionResult(result: ActionResult): void {
    if (result.ok) {
      this.liveActionsExecuted += 1;
    } else {
      this.liveActionsRefused += 1;
    }
  }

  private scheduleGuestSessionCap(capSeconds: number, generation: number): void {
    this.clearGuestSessionCapTimer();
    if (!Number.isFinite(capSeconds) || capSeconds <= 0) {
      return;
    }
    this.liveSessionCapTimer = window.setTimeout(() => {
      if (!this.liveActive || generation !== this.liveSessionGeneration) {
        return;
      }
      this.stopLiveSession({ resetWidget: false, emitComplete: false });
      this.widget?.showNotice(QUOTA_DISABLED_NOTICE);
      this.emit("error", { message: "session limit reached" });
    }, Math.round(capSeconds) * 1000);
  }

  private clearGuestSessionCapTimer(): void {
    if (this.liveSessionCapTimer) {
      window.clearTimeout(this.liveSessionCapTimer);
      this.liveSessionCapTimer = null;
    }
  }
}

export function resolveLiveActionsEnabled(options: {
  serverActionsEnabled: boolean;
  localActions?: boolean;
}): boolean {
  return options.serverActionsEnabled && options.localActions !== false;
}

const controller = new SkillyController();

export const init = (config: SkillyConfig): void => controller.init(config);
export const start = (goal?: string): void => controller.start(goal);
export const on = <Name extends SkillyEventName>(
  event: Name,
  handler: SkillyEventHandler<Name>,
): (() => void) => controller.on(event, handler);
export const identify = (endUserId: string, traits?: Record<string, unknown>): void =>
  controller.identify(endUserId, traits);
export const destroy = (): void => controller.destroy();
/** Snapshot the host page as a DOM digest (the screenshot-free page view). */
export const getPageDigest = (): DomDigest => controller.getPageDigest();

export type { SkillyConfig, SkillyEventMap, SkillyEventName } from "./types.js";
export type { DomDigest, DigestElement } from "@skilly/browser-core";

// Auto-init from `<script data-skilly-key="..." data-skilly-skill="...">`.
// Only runs in the script-embed (IIFE) path, where `currentScript` is set.
const embedScript = typeof document !== "undefined" ? document.currentScript : null;
if (
  typeof HTMLScriptElement !== "undefined" &&
  embedScript instanceof HTMLScriptElement &&
  embedScript.dataset.skillyKey
) {
  controller.init({
    key: embedScript.dataset.skillyKey,
    skill: embedScript.dataset.skillySkill,
    accentColor: embedScript.dataset.skillyAccent,
    locale: embedScript.dataset.skillyLocale,
    launcherLabel: embedScript.dataset.skillyLauncher,
    coreUrl: embedScript.dataset.skillyCoreUrl,
    backendUrl: embedScript.dataset.skillyBackendUrl,
    actions:
      embedScript.dataset.skillyActions === undefined
        ? undefined
        : embedScript.dataset.skillyActions === "true",
    bubbleMode:
      embedScript.dataset.skillyBubble === "fixed" || embedScript.dataset.skillyBubble === "follow"
        ? embedScript.dataset.skillyBubble
        : undefined,
    microphoneConsentText: embedScript.dataset.skillyMicrophoneConsent,
  });
}
