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
import { parsePointTags, PointingEngine } from "./pointing.js";
import type {
  SkillyConfig,
  SkillyEventHandler,
  SkillyEventMap,
  SkillyEventName,
} from "./types.js";

const DEFAULT_ACCENT = "#2F6BFF";

class SkillyController {
  private widget: SkillyWidget | null = null;
  private pointing: PointingEngine | null = null;
  private currentRegistry: ElementRegistry | null = null;
  // Storage is type-erased; the public on()/emit() signatures keep callers type-safe.
  private handlers = new Map<SkillyEventName, Set<(payload: never) => void>>();
  private turnInProgress = false;

  init(config: SkillyConfig): void {
    if (this.widget) {
      console.warn("[skilly] already initialized; call destroy() first to re-init.");
      return;
    }
    if (!config.key) {
      console.error("[skilly] init() requires a publishable `key`.");
      return;
    }

    this.widget = new SkillyWidget(config.accentColor ?? DEFAULT_ACCENT);
    this.widget.onLauncherActivated = () => this.start();
    this.widget.mount();
    this.pointing = new PointingEngine(this.widget);

    // Begin loading the shared WASM core in the background (optional in 8.1).
    void loadCore(config.coreUrl);
  }

  /**
   * Snapshot the host page as a DOM digest — the structured, screenshot-free
   * view the companion reasons over (and references in [POINT:id] tags). The
   * AI integration that consumes this lands in Phase 8.3.
   */
  getPageDigest(): DomDigest {
    const { digest, registry } = buildDomDigest();
    this.currentRegistry = registry;
    return digest;
  }

  /**
   * Open the companion and run a turn. 8.1 simulates the lifecycle
   * (listening -> thinking -> speaking -> complete) so the embed is
   * demonstrable; 8.3 replaces this with the OpenAI Realtime voice pipeline.
   */
  start(goal?: string): void {
    if (!this.widget || !this.pointing || this.turnInProgress) {
      return;
    }
    this.turnInProgress = true;
    this.emit("turn", { goal });

    // Capture the page as a DOM digest at the start of the turn (8.3 sends it to the AI).
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
    void endUserId;
    void traits;
  }

  /** Tear down the widget and clear subscriptions. */
  destroy(): void {
    this.pointing?.clear();
    this.pointing = null;
    this.currentRegistry = null;
    this.widget?.destroy();
    this.widget = null;
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
if (embedScript instanceof HTMLScriptElement && embedScript.dataset.skillyKey) {
  controller.init({
    key: embedScript.dataset.skillyKey,
    skill: embedScript.dataset.skillySkill,
    accentColor: embedScript.dataset.skillyAccent,
    locale: embedScript.dataset.skillyLocale,
    coreUrl: embedScript.dataset.skillyCoreUrl,
    backendUrl: embedScript.dataset.skillyBackendUrl,
  });
}
