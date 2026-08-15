import { describe, expect, test } from "bun:test";
import {
  buildSessionUpdatePayload,
  RealtimeSession,
  type RealtimeCallbacks,
} from "../src/realtime";

function makeSession(callbackOverrides: Partial<RealtimeCallbacks> = {}): RealtimeSession {
  return new RealtimeSession({
    clientSecret: "ephemeral_test",
    model: "gpt-realtime",
    instructions: "Help the visitor.",
    callbacks: {
      onStateChange: () => {},
      onUserTranscript: () => {},
      onAssistantText: () => {},
      onError: () => {},
      ...callbackOverrides,
    },
  });
}

describe("typed Realtime input", () => {
  test("sends a user input_text item followed by response.create", () => {
    const sentEvents: string[] = [];
    const session = makeSession();
    const sessionInternals = session as unknown as {
      dataChannel: { readyState: string; send: (payload: string) => void };
    };
    sessionInternals.dataChannel = {
      readyState: "open",
      send: (payload) => sentEvents.push(payload),
    };

    expect(session.sendText("  Where do I create a project?  ")).toBe(true);
    expect(sentEvents.map((event) => JSON.parse(event))).toEqual([
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Where do I create a project?" }],
        },
      },
      { type: "response.create" },
    ]);
  });

  test("does not send empty text or write to a channel that is not open", () => {
    const sentEvents: string[] = [];
    const session = makeSession();
    const sessionInternals = session as unknown as {
      dataChannel: { readyState: string; send: (payload: string) => void };
    };
    sessionInternals.dataChannel = {
      readyState: "connecting",
      send: (payload) => sentEvents.push(payload),
    };

    expect(session.sendText("hello")).toBe(false);
    sessionInternals.dataChannel.readyState = "open";
    expect(session.sendText("   ")).toBe(false);
    expect(sentEvents).toEqual([]);
  });
});

describe("Realtime audio playback lifecycle", () => {
  test("reports WebRTC audio start, stop, and interruption events", () => {
    const lifecycle: string[] = [];
    const session = makeSession({
      onAudioPlaybackStarted: () => lifecycle.push("started"),
      onAudioPlaybackEnded: () => lifecycle.push("ended"),
    });
    const sessionInternals = session as unknown as {
      handleServerEvent: (raw: string) => void;
    };

    sessionInternals.handleServerEvent(JSON.stringify({ type: "output_audio_buffer.started" }));
    sessionInternals.handleServerEvent(JSON.stringify({ type: "output_audio_buffer.stopped" }));
    sessionInternals.handleServerEvent(JSON.stringify({ type: "output_audio_buffer.cleared" }));

    expect(lifecycle).toEqual(["started", "ended", "ended"]);
  });
});

describe("guided-task progress", () => {
  test("registers the progress tool even when page actions are disabled", () => {
    const payload = buildSessionUpdatePayload({
      model: "gpt-realtime",
      instructions: "Help the visitor.",
      actions: false,
    });

    expect(JSON.stringify(payload)).toContain("update_guidance_progress");
    expect(JSON.stringify(payload)).not.toContain("perform_action");
  });

  test("forwards one explicit progress call and response completion", () => {
    const calls: string[] = [];
    let completedResponses = 0;
    const session = makeSession({
      onGuidanceProgressToolCall: (call) => calls.push(call.argumentsJson),
      onResponseDone: () => {
        completedResponses += 1;
      },
    });
    const sessionInternals = session as unknown as {
      handleServerEvent: (raw: string) => void;
    };

    const functionCall = {
      type: "function_call",
      name: "update_guidance_progress",
      call_id: "progress-1",
      arguments: JSON.stringify({
        title: "Create a project",
        steps: ["Open projects", "Choose a template"],
        current_step: 1,
        status: "in_progress",
      }),
    };
    sessionInternals.handleServerEvent(JSON.stringify({ type: "response.done", response: { output: [functionCall] } }));
    sessionInternals.handleServerEvent(
      JSON.stringify({
        type: "response.function_call_arguments.done",
        name: functionCall.name,
        call_id: functionCall.call_id,
        arguments: functionCall.arguments,
      }),
    );

    expect(calls).toHaveLength(1);
    expect(completedResponses).toBe(1);
  });
});
