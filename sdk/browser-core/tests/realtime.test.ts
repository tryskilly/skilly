import { describe, expect, test } from "bun:test";
import { RealtimeSession, type RealtimeCallbacks } from "../src/realtime";

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
