import { describe, expect, test } from "bun:test";
import { resolveLiveActionsEnabled } from "../src/index";
import { BackendError, buildSessionUsagePayload, fetchSessionToken, fetchTenantSkill, reportSessionUsage } from "../src/token";

const BACKEND = "http://localhost:4310";
const KEY = "pk_test_demo";

describe("fetchSessionToken", () => {
  test("parses a successful token response", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ clientSecret: "ek_abc", model: "gpt-realtime", expiresAt: 123, actionsEnabled: true }),
        { status: 200 },
      );
    const token = await fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch });
    expect(token.clientSecret).toBe("ek_abc");
    expect(token.model).toBe("gpt-realtime");
    expect(token.actionsEnabled).toBe(true);
  });

  test("defaults actionsEnabled to false for older backends", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ clientSecret: "ek_abc", model: "gpt-realtime" }), { status: 200 });
    const token = await fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch });
    expect(token.actionsEnabled).toBe(false);
  });

  test("throws BackendError with the status on failure", async () => {
    const fetchImpl = async () => new Response("nope", { status: 403 });
    await expect(
      fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toMatchObject({ name: "BackendError", status: 403 });
  });

  test("rejects when clientSecret is missing", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ model: "x" }), { status: 200 });
    await expect(
      fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(BackendError);
  });
});

describe("actions enablement precedence", () => {
  test("server flag wins in live mode unless local config is explicitly false", () => {
    expect(resolveLiveActionsEnabled({ serverActionsEnabled: true })).toBe(true);
    expect(resolveLiveActionsEnabled({ serverActionsEnabled: false, localActions: true })).toBe(false);
    expect(resolveLiveActionsEnabled({ serverActionsEnabled: true, localActions: false })).toBe(false);
    expect(resolveLiveActionsEnabled({ serverActionsEnabled: true, localActions: true })).toBe(true);
  });
});

describe("reportSessionUsage", () => {
  test("builds a usage payload with action counters", () => {
    expect(
      buildSessionUsagePayload({
        seconds: 12.6,
        actionsExecuted: 2,
        actionsRefused: 1,
        endUserId: "user_123",
      }),
    ).toEqual({ seconds: 13, actionsExecuted: 2, actionsRefused: 1, endUserId: "user_123" });
  });

  test("sends action counters to the usage endpoint", async () => {
    let body: Record<string, unknown> | null = null;
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await reportSessionUsage({
      backendUrl: BACKEND,
      publishableKey: KEY,
      seconds: 7,
      actionsExecuted: 3,
      actionsRefused: 2,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(body).toMatchObject({ seconds: 7, actionsExecuted: 3, actionsRefused: 2 });
  });
});

describe("fetchTenantSkill", () => {
  test("returns content on 200", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ content: "# Skill" }), { status: 200 });
    const content = await fetchTenantSkill({
      backendUrl: BACKEND,
      publishableKey: KEY,
      skillId: "acme",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(content).toBe("# Skill");
  });

  test("returns null on 404", async () => {
    const fetchImpl = async () => new Response("missing", { status: 404 });
    const content = await fetchTenantSkill({
      backendUrl: BACKEND,
      publishableKey: KEY,
      skillId: "absent",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(content).toBeNull();
  });
});
