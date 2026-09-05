import { describe, expect, test } from "bun:test";
import {
  deliverExtensionUsage,
  enqueueExtensionUsage,
  flushExtensionUsageOutbox,
  type ExtensionUsageReport,
  type UsageStorage,
} from "../src/usage";

const report: ExtensionUsageReport = {
  accountId: "user_1",
  eventId: "event_1",
  sessionId: "session_1",
  seconds: 12,
  result: "completed",
  model: "gpt-realtime",
  actionsExecuted: 2,
  actionsRefused: 1,
};

function makeStorage(initial: unknown[] = []): UsageStorage & { value: unknown[] } {
  const storage = {
    value: initial,
    async get() {
      return { pendingUsageReports: this.value };
    },
    async set(items: Record<string, unknown>) {
      this.value = (items.pendingUsageReports as unknown[]) ?? [];
    },
  };
  return storage;
}

describe("deliverExtensionUsage", () => {
  test("posts the complete flat usage payload without fabricated token data", async () => {
    const calls: RequestInit[] = [];
    const result = await deliverExtensionUsage("https://studio.tryskilly.app/", "tok", report, async (_url, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ ok: true, recordedSeconds: 12 }), { status: 200 });
    });
    expect(result).toBe("confirmed");
    expect(JSON.parse(calls[0]!.body as string)).toEqual({
      eventId: "event_1",
      sessionId: "session_1",
      seconds: 12,
      result: "completed",
      model: "gpt-realtime",
      actionsExecuted: 2,
      actionsRefused: 1,
    });
  });

  test("retries transient failure with the same event id", async () => {
    const bodies: string[] = [];
    let attempts = 0;
    const result = await deliverExtensionUsage("https://studio.tryskilly.app", "tok", report, async (_url, init) => {
      attempts += 1;
      bodies.push(init?.body as string);
      if (attempts < 3) return new Response("busy", { status: 503 });
      return new Response("ok", { status: 200 });
    });
    expect(result).toBe("confirmed");
    expect(attempts).toBe(3);
    expect(new Set(bodies.map((body) => JSON.parse(body).eventId))).toEqual(new Set(["event_1"]));
  });

  test("defers offline reports after bounded retries", async () => {
    let attempts = 0;
    const result = await deliverExtensionUsage("https://studio.tryskilly.app", "tok", report, async () => {
      attempts += 1;
      throw new Error("offline");
    });
    expect(result).toBe("deferred");
    expect(attempts).toBe(3);
  });
});

describe("usage outbox", () => {
  test("persists before sending and binds queued usage to its account", async () => {
    const storage = makeStorage();
    expect(await enqueueExtensionUsage(storage, report)).toBe(true);
    expect(storage.value).toHaveLength(1);

    let calls = 0;
    await flushExtensionUsageOutbox(storage, "https://studio.tryskilly.app", "other-token", "user_2", async () => {
      calls += 1;
      return new Response("should not send", { status: 200 });
    });
    expect(calls).toBe(0);
    expect(storage.value).toHaveLength(1);

    await flushExtensionUsageOutbox(storage, "https://studio.tryskilly.app", "user-token", "user_1", async () => {
      calls += 1;
      return new Response("ok", { status: 200 });
    });
    expect(calls).toBe(1);
    expect(storage.value).toHaveLength(0);
  });

  test("retains deferred reports for the next authenticated opportunity", async () => {
    const storage = makeStorage();
    await enqueueExtensionUsage(storage, report);
    await flushExtensionUsageOutbox(storage, "https://studio.tryskilly.app", "user-token", "user_1", async () => {
      throw new Error("offline");
    });
    expect(storage.value).toHaveLength(1);
  });

  test("removes a permanently invalid report without retrying", async () => {
    const storage = makeStorage();
    await enqueueExtensionUsage(storage, report);
    let calls = 0;
    await flushExtensionUsageOutbox(storage, "https://studio.tryskilly.app", "user-token", "user_1", async () => {
      calls += 1;
      return new Response("bad report", { status: 400 });
    });
    expect(calls).toBe(1);
    expect(storage.value).toHaveLength(0);
  });
});
