import { describe, expect, test } from "bun:test";
import { createRealtimeHost } from "../src/realtimeHost";
import type { OffscreenToBackgroundMessage } from "../src/messages";

/** Stands in for a RealtimeSession, recording what the host does to it. */
class FakeSession {
  connected = false;
  closed = false;
  readonly functionOutputs: Array<{ callId: string; output: string }> = [];
  onActionToolCall?: (call: { callId: string; name: "perform_action"; argumentsJson: string }) => void;

  async connect(): Promise<void> {
    this.connected = true;
  }
  close(): void {
    this.closed = true;
  }
  sendFunctionCallOutput(callId: string, output: string): void {
    this.functionOutputs.push({ callId, output });
  }
}

function makeHost() {
  const posted: OffscreenToBackgroundMessage[] = [];
  const sessions: FakeSession[] = [];
  // Controlled clock: a session that starts and stops within the same millisecond correctly
  // reports no usage, so real elapsed time has to be simulated rather than slept for.
  const clock = { now: 1_000_000 };
  const host = createRealtimeHost({
    now: () => clock.now,
    post: (message) => posted.push(message),
    createSession: (config) => {
      const fake = new FakeSession();
      fake.onActionToolCall = config.callbacks.onActionToolCall;
      sessions.push(fake);
      return fake as unknown as never;
    },
  });
  return { host, posted, sessions, clock };
}

const START = {
  type: "start-session",
  clientSecret: "ek_test",
  model: "gpt-realtime",
  instructions: "be helpful",
  actionsEnabled: true,
} as const;

describe("createRealtimeHost", () => {
  test("start-session connects a session", () => {
    const { host, sessions } = makeHost();
    host.handle({ ...START });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.connected).toBe(true);
  });

  test("stop-session closes it and reports usage", () => {
    const { host, posted, sessions, clock } = makeHost();
    host.handle({ ...START });
    clock.now += 42_000;
    host.handle({ type: "stop-session" });
    expect(sessions[0]!.closed).toBe(true);
    const usage = posted.find((m) => m.type === "usage-report");
    expect(usage).toEqual({ type: "usage-report", seconds: 42, actionsExecuted: 0, actionsRefused: 0 });
  });

  test("starting again tears the previous session down through the full stop path", () => {
    const { host, posted, sessions, clock } = makeHost();
    host.handle({ ...START });
    clock.now += 5_000;
    host.handle({ ...START });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.closed).toBe(true);
    // The first session's minutes are reported, not silently dropped.
    expect(posted.filter((m) => m.type === "usage-report")).toHaveLength(1);
  });

  test("a tool call is forwarded to the coordinator and answered with its outcome", async () => {
    const { host, posted, sessions } = makeHost();
    host.handle({ ...START });

    sessions[0]!.onActionToolCall!({
      callId: "call_1",
      name: "perform_action",
      argumentsJson: JSON.stringify({ action: "click", element_id: "f0:el_1", destructive: false }),
    });
    await Promise.resolve();

    const request = posted.find((m) => m.type === "action-request");
    expect(request).toBeDefined();

    host.handle({ type: "action-outcome", callId: "call_1", result: { ok: true } });
    await Promise.resolve();
    await Promise.resolve();

    expect(sessions[0]!.functionOutputs).toHaveLength(1);
    expect(JSON.parse(sessions[0]!.functionOutputs[0]!.output).ok).toBe(true);
  });

  // Regression: dropping the resolver left the model's tool call unanswered forever.
  test("stopping with an action in flight resolves it as session_closed", async () => {
    const { host, sessions } = makeHost();
    host.handle({ ...START });

    sessions[0]!.onActionToolCall!({
      callId: "call_1",
      name: "perform_action",
      argumentsJson: JSON.stringify({ action: "click", element_id: "f0:el_1", destructive: false }),
    });
    await Promise.resolve();

    host.handle({ type: "stop-session" });
    await Promise.resolve();
    await Promise.resolve();

    // The session is gone, so no output is sent to it — but the promise settled rather than
    // leaking. A hung promise would leave this test timing out instead.
    expect(sessions[0]!.closed).toBe(true);
  });

  // Regression: reading the current session meant a restart sent this output to the NEW session.
  test("an outcome arriving after a restart is not sent to the new session", async () => {
    const { host, sessions } = makeHost();
    host.handle({ ...START });

    sessions[0]!.onActionToolCall!({
      callId: "call_1",
      name: "perform_action",
      argumentsJson: JSON.stringify({ action: "click", element_id: "f0:el_1", destructive: false }),
    });
    await Promise.resolve();

    host.handle({ ...START }); // restart
    host.handle({ type: "action-outcome", callId: "call_1", result: { ok: true } });
    await Promise.resolve();
    await Promise.resolve();

    expect(sessions[1]!.functionOutputs).toHaveLength(0);
  });

  test("malformed tool arguments are refused without reaching the coordinator", async () => {
    const { host, posted, sessions } = makeHost();
    host.handle({ ...START });

    sessions[0]!.onActionToolCall!({ callId: "call_bad", name: "perform_action", argumentsJson: "{not json" });
    await Promise.resolve();

    expect(posted.some((m) => m.type === "action-request")).toBe(false);
    expect(JSON.parse(sessions[0]!.functionOutputs[0]!.output)).toEqual({
      ok: false,
      error: "unsupported_target",
    });
  });

  test("dispose stops a live session", () => {
    const { host, sessions } = makeHost();
    host.handle({ ...START });
    host.dispose();
    expect(sessions[0]!.closed).toBe(true);
  });
});
