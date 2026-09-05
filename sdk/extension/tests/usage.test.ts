import { describe, expect, test } from "bun:test";
import { reportExtensionUsage, type ExtensionUsageReport } from "../src/usage";

const report: ExtensionUsageReport = {
  eventId: "event_1",
  sessionId: "session_1",
  seconds: 12,
  result: "completed",
  model: "gpt-realtime",
  actionsExecuted: 2,
  actionsRefused: 1,
};

describe("reportExtensionUsage", () => {
  test("posts the complete flat usage payload", async () => {
    const calls: RequestInit[] = [];
    const ok = await reportExtensionUsage("https://studio.tryskilly.app/", "tok", report, async (_url, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ ok: true, recordedSeconds: 12 }), { status: 200 });
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.body as string)).toEqual({
      eventId: "event_1",
      sessionId: "session_1",
      seconds: 12,
      result: "completed",
      model: "gpt-realtime",
      actionsExecuted: 2,
      actionsRefused: 1,
      tokens: {},
    });
  });

  test("retries transient failure with the same event id", async () => {
    const bodies: string[] = [];
    let attempts = 0;
    const ok = await reportExtensionUsage("https://studio.tryskilly.app", "tok", report, async (_url, init) => {
      attempts += 1;
      bodies.push(init?.body as string);
      if (attempts < 3) return new Response("busy", { status: 503 });
      return new Response("ok", { status: 200 });
    });
    expect(ok).toBe(true);
    expect(attempts).toBe(3);
    expect(new Set(bodies.map((body) => JSON.parse(body).eventId))).toEqual(new Set(["event_1"]));
  });

  test("does not retry permanent client failures", async () => {
    let attempts = 0;
    const ok = await reportExtensionUsage("https://studio.tryskilly.app", "tok", report, async () => {
      attempts += 1;
      return new Response(JSON.stringify({ error: "bad" }), { status: 400 });
    });
    expect(ok).toBe(false);
    expect(attempts).toBe(1);
  });
});
