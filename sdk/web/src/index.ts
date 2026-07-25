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

import { loadCore } from "./core.js";
import { SkillyWidget } from "./widget.js";
import { buildDomDigest, type DomDigest, type ElementRegistry } from "./digest.js";
import { inferPointFromText, parsePointTags, PointingEngine } from "./pointing.js";
import { fetchSessionToken, fetchTenantSkill, reportSessionUsage } from "./token.js";
import { buildCompanionInstructions } from "./prompt.js";
import { RealtimeSession, type RealtimeActionToolCall, type RealtimeState } from "./realtime.js";
import { ActionExecutor, parseActionRequest, type ActionResult } from "./actions.js";
import type {
  SkillyConfig,
  SkillyEventHandler,
  SkillyEventMap,
  SkillyEventName,
} from "./types.js";

const DEFAULT_ACCENT = "#2F6BFF";

class SkillyController {
  private config: SkillyConfig | null = null;
  private widget: SkillyWidget | null = null;
  private pointing: PointingEngine | null = null;
  private currentDigest: DomDigest | null = null;
  private currentRegistry: ElementRegistry | null = null;
  // Storage is type-erased; the public on()/emit() signatures keep callers type-safe.
  private handlers = new Map<SkillyEventName, Set<(payload: never) => void>>();
  private turnInProgress = false;

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
  private lastPointedTarget: string | null = null;
  private identifiedEndUser: { id: string; traits?: Record<string, unknown> } | null = null;

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

    this.widget = new SkillyWidget(config.accentColor ?? DEFAULT_ACCENT, config.launcherLabel);
    this.widget.onLauncherActivated = () => this.start();
    this.widget.mount();
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
      void this.toggleLiveSession(goal);
      return;
    }
    // Simulated mode (no backend configured) — keeps the embed demonstrable.
    if (this.turnInProgress) {
      return;
    }
    this.turnInProgress = true;
    this.emit("turn", { goal });

    // Capture the page as a DOM digest at the start of the turn.
    const digest = this.getPageDigest();

    this.widget.setState("listening");
    this.widget.setBubbleText("Listening…");

    window.setTimeout(() => {
      this.widget?.setState("thinking");
      this.widget?.setBubbleText("Thinking…");
    }, 800);

    window.setTimeout(() => {
      void this.respondAndPoint(goal, digest);
    }, 1600);

    window.setTimeout(() => {
      this.widget?.setState("idle");
      this.widget?.setBubbleText("");
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
  private async respondAndPoint(goal: string | undefined, digest: DomDigest): Promise<void> {
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

    const firstPoint = points[0];
    if (firstPoint) {
      const resolved = await this.pointing.pointAt(
        firstPoint.target,
        firstPoint.label,
        this.currentRegistry ?? undefined,
      );
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
    const generation = ++this.liveSessionGeneration;
    this.liveSessionStartedAt = Date.now();
    this.liveActionsExecuted = 0;
    this.liveActionsRefused = 0;
    this.emit("turn", { goal });
    this.widget.setState("thinking");
    this.widget.setBubbleText("Connecting…");

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
          onUserTranscript: () => {
            if (generation === this.liveSessionGeneration) {
              actionExecutor?.resetTurnLimit();
            }
          },
          onResponseCreated: () => {},
          onAssistantText: (text) => {
            if (generation === this.liveSessionGeneration) {
              this.onAssistantText(text, generation);
            }
          },
          onActionToolCall: (call) => {
            if (generation === this.liveSessionGeneration) {
              void this.onActionToolCall(call, generation, realtimeSession, actionExecutor);
            }
          },
          onError: (message) => {
            if (generation !== this.liveSessionGeneration) {
              return;
            }
            this.widget?.setBubbleText(`Sorry — ${message}`);
            this.emit("error", { message });
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
      this.liveActive = false;
      const message = sessionError instanceof Error ? sessionError.message : "couldn't start session";
      this.widget.setState("idle");
      this.widget.setBubbleText(`Sorry — ${message}`);
      this.emit("error", { message });
    }
  }

  private onRealtimeState(state: RealtimeState): void {
    if (!this.widget) {
      return;
    }
    if (state === "connecting") {
      this.widget.setState("thinking");
    } else if (state === "live") {
      this.widget.setState("listening");
      this.widget.setBubbleText("Listening… ask me anything.");
    } else if (state === "closed" || state === "error") {
      this.widget.setState("idle");
    }
  }

  /** Each assistant text update: show it, and drive any new [POINT] tag. */
  private onAssistantText(fullText: string, generation?: number): void {
    if (!this.widget || !this.pointing) {
      return;
    }
    this.widget.setState("speaking");
    const { cleanedText, points } = parsePointTags(fullText);
    this.widget.setBubbleText(cleanedText);

    const point = points[0] ?? inferPointFromText(cleanedText, this.currentDigest);
    if (point && point.target !== this.lastPointedTarget) {
      this.lastPointedTarget = point.target;
      void this.pointing
        .pointAt(point.target, point.label, this.currentRegistry ?? undefined)
        .then((resolved) => {
          if (generation !== undefined && generation !== this.liveSessionGeneration) {
            return;
          }
          if (resolved) {
            this.emit("point", { selector: point.target, label: resolved.label });
          }
        });
    }
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

  private stopLiveSession(): void {
    this.liveSessionGeneration += 1;
    this.clearGuestSessionCapTimer();
    this.actionExecutor?.close();
    this.actionExecutor = null;
    this.widget?.cancelActionConfirmation();
    this.realtimeSession?.close();
    this.realtimeSession = null;
    this.liveActive = false;
    this.lastPointedTarget = null;
    this.pointing?.clear();
    this.widget?.setState("idle");
    this.widget?.setBubbleText("");

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

    this.emit("complete", {});
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
    this.handlers.clear();
    this.turnInProgress = false;
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
      this.widget?.setBubbleText("Session limit reached.");
      this.stopLiveSession();
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
export type { DomDigest, DigestElement } from "./digest.js";

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
  });
}
