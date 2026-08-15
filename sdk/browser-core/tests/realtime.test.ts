import { describe, expect, test } from "bun:test";
import { RealtimeSession } from "../src/realtime";

function makeSession(): RealtimeSession {
  return new RealtimeSession({
    clientSecret: "ephemeral_test",
    model: "gpt-realtime",
    instructions: "Help the visitor.",
    callbacks: {
      onStateChange: () => {},
      onUserTranscript: () => {},
      onAssistantText: () => {},
      onError: () => {},
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
