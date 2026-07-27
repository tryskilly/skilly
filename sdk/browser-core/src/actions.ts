import type { ElementRegistry } from "./digest.js";
import type { PointingEngine } from "./pointing.js";

export type ActionKind = "click" | "fill";

export interface ActionRequest {
  action: ActionKind;
  element_id: string;
  value?: string;
  destructive: boolean;
}

export interface ActionResult {
  ok: boolean;
  action?: ActionKind;
  elementLabel?: string;
  error?:
    | "unknown_element"
    | "not_allowed"
    | "declined"
    | "rate_limited"
    | "unsupported_target"
    | "session_closed";
}

export interface ActionConfirmationRequest {
  action: ActionKind;
  elementLabel: string;
}

export interface ActionExecutorConfig {
  getRegistry: () => ElementRegistry | null;
  pointing: PointingEngine;
  confirm: (request: ActionConfirmationRequest) => Promise<boolean>;
  isSessionActive: () => boolean;
  maxActionsPerTurn?: number;
}

export const DEFAULT_MAX_ACTIONS_PER_TURN = 3;

const DESTRUCTIVE_KEYWORDS = [
  "delete",
  "remove",
  "destroy",
  "pay",
  "purchase",
  "buy",
  "send",
  "submit",
  "confirm order",
  "cancel plan",
  "unsubscribe",
  "transfer",
];

const TEXT_LIKE_INPUT_TYPES = ["text", "search", "email", "url", "tel", "password", "number"];

export function isActionKind(value: unknown): value is ActionKind {
  return value === "click" || value === "fill";
}

export function parseActionRequest(value: unknown): ActionRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (!isActionKind(candidate.action) || typeof candidate.element_id !== "string") {
    return null;
  }
  return {
    action: candidate.action,
    element_id: candidate.element_id,
    value: typeof candidate.value === "string" ? candidate.value : undefined,
    destructive: candidate.destructive === true,
  };
}

export function hasDestructiveKeyword(label: string): boolean {
  const normalized = label.toLowerCase();
  return DESTRUCTIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isSupportedFillInputType(type: string): boolean {
  return TEXT_LIKE_INPUT_TYPES.includes(type);
}

export function requiresConfirmation(options: {
  destructive: boolean;
  tenantAnnotated: boolean;
  elementLabel: string;
}): boolean {
  return options.destructive || !options.tenantAnnotated || hasDestructiveKeyword(options.elementLabel);
}

export function createActionRateLimiter(maxActions = DEFAULT_MAX_ACTIONS_PER_TURN): {
  canExecute: () => boolean;
  tryAcquire: () => boolean;
  reset: () => void;
  count: () => number;
} {
  let executedActions = 0;
  return {
    canExecute: () => executedActions < maxActions,
    tryAcquire: () => {
      if (executedActions >= maxActions) {
        return false;
      }
      executedActions += 1;
      return true;
    },
    reset: () => {
      executedActions = 0;
    },
    count: () => executedActions,
  };
}

export function preflightAction(options: {
  executedActions: number;
  maxActions?: number;
  elementFound: boolean;
  noAct: boolean;
  action: ActionKind;
  supportsFill: boolean;
  slotAcquired?: boolean;
}): ActionResult | null {
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS_PER_TURN;
  if (options.slotAcquired === false || (options.slotAcquired === undefined && options.executedActions >= maxActions)) {
    return { ok: false, error: "rate_limited" };
  }
  if (!options.elementFound) {
    return { ok: false, error: "unknown_element" };
  }
  if (options.noAct) {
    return { ok: false, error: "not_allowed" };
  }
  if (options.action === "fill" && !options.supportsFill) {
    return { ok: false, error: "unsupported_target" };
  }
  return null;
}

export class ActionExecutor {
  private readonly limiter;
  private closed = false;

  constructor(private readonly config: ActionExecutorConfig) {
    this.limiter = createActionRateLimiter(config.maxActionsPerTurn);
  }

  resetTurnLimit(): void {
    this.limiter.reset();
  }

  close(): void {
    this.closed = true;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (this.closed || !this.config.isSessionActive()) {
      return { ok: false, error: "session_closed" };
    }

    const registry = this.config.getRegistry();
    const element = registry?.get(request.element_id) ?? null;
    const label = element ? accessibleLabel(element) || request.element_id : request.element_id;
    const noAct = Boolean(element?.closest("[data-skilly-no-act]"));
    const slotAcquired = element && !noAct ? this.limiter.tryAcquire() : undefined;
    const preflight = preflightAction({
      executedActions: this.limiter.count(),
      slotAcquired,
      elementFound: Boolean(element),
      noAct,
      action: request.action,
      supportsFill: element ? supportsFill(element) : false,
    });
    if (preflight) {
      return { ...preflight, action: request.action, elementLabel: label };
    }
    if (!element || !registry) {
      return { ok: false, action: request.action, elementLabel: label, error: "unknown_element" };
    }

    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const resolved = await this.config.pointing.pointAt(request.element_id, label, registry);
    if (this.closed || !this.config.isSessionActive()) {
      return { ok: false, action: request.action, elementLabel: label, error: "session_closed" };
    }
    if (!resolved) {
      return { ok: false, action: request.action, elementLabel: label, error: "unknown_element" };
    }

    if (
      requiresConfirmation({
        destructive: request.destructive,
        tenantAnnotated: element.hasAttribute("data-skilly"),
        elementLabel: label,
      })
    ) {
      const confirmed = await this.config.confirm({ action: request.action, elementLabel: label });
      if (this.closed || !this.config.isSessionActive()) {
        return { ok: false, action: request.action, elementLabel: label, error: "session_closed" };
      }
      if (!confirmed) {
        return { ok: false, action: request.action, elementLabel: label, error: "declined" };
      }
    }

    if (request.action === "fill") {
      fillNativeControl(element, request.value ?? "");
    } else {
      element.click();
    }
    return { ok: true, action: request.action, elementLabel: label };
  }
}

function accessibleLabel(element: HTMLElement): string {
  const candidate =
    element.getAttribute("aria-label") ??
    element.dataset.skillyLabel ??
    element.dataset.skilly ??
    element.getAttribute("placeholder") ??
    element.getAttribute("title") ??
    element.textContent ??
    "";
  return candidate.replace(/\s+/g, " ").trim();
}

function supportsFill(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (typeof HTMLTextAreaElement !== "undefined" && element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (typeof HTMLInputElement === "undefined" || !(element instanceof HTMLInputElement)) {
    return false;
  }
  return isSupportedFillInputType(element.type);
}

function fillNativeControl(element: HTMLElement, value: string): void {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return;
  }

  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
