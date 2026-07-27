import { describe, expect, test } from "bun:test";
import {
  ActionExecutor,
  createActionRateLimiter,
  hasDestructiveKeyword,
  isSupportedFillInputType,
  preflightAction,
  requiresConfirmation,
} from "../src/actions";
import { buildSessionUpdatePayload } from "../src/realtime";

describe("action guardrails", () => {
  test("screens destructive keywords independent of the model flag", () => {
    expect(hasDestructiveKeyword("Delete project")).toBe(true);
    expect(hasDestructiveKeyword("Confirm order")).toBe(true);
    expect(requiresConfirmation({ destructive: false, tenantAnnotated: true, elementLabel: "Send invoice" })).toBe(
      true,
    );
    expect(requiresConfirmation({ destructive: false, tenantAnnotated: true, elementLabel: "Open settings" })).toBe(
      false,
    );
  });

  test("enforces the per-turn executed action cap", () => {
    const limiter = createActionRateLimiter(3);
    expect(limiter.canExecute()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.canExecute()).toBe(false);
    expect(limiter.tryAcquire()).toBe(false);
    expect(
      preflightAction({
        executedActions: limiter.count(),
        slotAcquired: false,
        elementFound: true,
        noAct: false,
        action: "click",
        supportsFill: true,
      }),
    ).toEqual({ ok: false, error: "rate_limited" });
  });

  test("reserves action slots atomically across concurrent executes", async () => {
    let clicks = 0;
    const registry = new Map<string, HTMLElement>();
    const element = {
      dataset: { skilly: "safe-action" },
      textContent: "Open settings",
      getAttribute: () => null,
      hasAttribute: (name: string) => name === "data-skilly",
      closest: () => null,
      scrollIntoView: () => {},
      click: () => {
        clicks += 1;
      },
    } as unknown as HTMLElement;
    registry.set("safe-action", element);
    const executor = new ActionExecutor({
      getRegistry: () => registry,
      pointing: {
        pointAt: async () => ({ x: 0, y: 0, label: "Open settings", element }),
      },
      confirm: async () => true,
      isSessionActive: () => true,
    });

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        executor.execute({ action: "click", element_id: "safe-action", destructive: false }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(results.filter((result) => result.error === "rate_limited")).toHaveLength(1);
    expect(clicks).toBe(3);
  });

  test("refuses data-skilly-no-act targets", () => {
    expect(
      preflightAction({
        executedActions: 0,
        elementFound: true,
        noAct: true,
        action: "click",
        supportsFill: true,
      }),
    ).toEqual({ ok: false, error: "not_allowed" });
  });

  test("refuses unknown element ids", () => {
    expect(
      preflightAction({
        executedActions: 0,
        elementFound: false,
        noAct: false,
        action: "click",
        supportsFill: false,
      }),
    ).toEqual({ ok: false, error: "unknown_element" });
  });

  test("requires confirmation unless a tenant annotation and clean model/label make it safe", () => {
    expect(
      requiresConfirmation({ destructive: false, tenantAnnotated: false, elementLabel: "Open settings" }),
    ).toBe(true);
    expect(
      requiresConfirmation({ destructive: false, tenantAnnotated: true, elementLabel: "Open settings" }),
    ).toBe(false);
    expect(requiresConfirmation({ destructive: false, tenantAnnotated: true, elementLabel: "Delete project" })).toBe(
      true,
    );
    expect(requiresConfirmation({ destructive: true, tenantAnnotated: true, elementLabel: "Open settings" })).toBe(
      true,
    );
  });

  test("supports fill only for text-like input types", () => {
    expect(isSupportedFillInputType("text")).toBe(true);
    expect(isSupportedFillInputType("email")).toBe(true);
    expect(isSupportedFillInputType("file")).toBe(false);
    expect(isSupportedFillInputType("checkbox")).toBe(false);
  });
});

describe("perform_action tool registration", () => {
  test("omits perform_action when actions are disabled", () => {
    const payload = buildSessionUpdatePayload({
      model: "gpt-realtime",
      instructions: "test",
      actions: false,
    });
    expect(JSON.stringify(payload)).not.toContain("perform_action");
  });

  test("includes perform_action when actions are enabled", () => {
    const payload = buildSessionUpdatePayload({
      model: "gpt-realtime",
      instructions: "test",
      actions: true,
    });
    expect(JSON.stringify(payload)).toContain("perform_action");
  });
});
