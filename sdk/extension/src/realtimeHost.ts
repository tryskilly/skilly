// The Realtime session host, decoupled from where it runs.
//
// Chrome MV3 background is a service worker: no getUserMedia, no WebRTC, killable at any time —
// so there it runs inside an offscreen document. Firefox MV3 background is an *event page*, a
// real document with DOM and WebRTC, so there it runs in-process and no offscreen document
// (a Chrome-only API) is involved. Both paths share this file; only the transport differs.
import {
  RealtimeSession,
  parseActionRequest,
  type RealtimeConfig,
  type RealtimeActionToolCall,
  type ActionResult,
} from "@skilly/browser-core";
import type { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from "./messages";

export interface RealtimeHostOptions {
  /** How this host reports back to the coordinator (chrome.runtime, or a direct call). */
  post: (message: OffscreenToBackgroundMessage) => void;
  /** Injectable for tests; defaults to a real RealtimeSession. */
  createSession?: (config: RealtimeConfig) => RealtimeSession;
  /** Injectable clock so session-duration behaviour is testable without sleeping. */
  now?: () => number;
}

export interface RealtimeHost {
  handle(message: BackgroundToOffscreenMessage): void;
  /** Stop any live session and release its pending work (page teardown, extension unload). */
  dispose(): void;
}

export function createRealtimeHost({ post, createSession, now }: RealtimeHostOptions): RealtimeHost {
  const newSession = createSession ?? ((config: RealtimeConfig) => new RealtimeSession(config));
  const currentTime = now ?? (() => Date.now());

  let session: RealtimeSession | null = null;
  let sessionStartedAt = 0;
  let actionsExecuted = 0;
  let actionsRefused = 0;

  /** callId -> resolver, for action results routed back from the content script. */
  const pendingActionResolvers = new Map<string, (result: ActionResult) => void>();

  /**
   * Resolve every in-flight action as session_closed. Dropping them would leave
   * handleActionToolCall awaiting a promise that can never settle, so the model's tool call
   * would go unanswered forever.
   */
  function releasePendingActions(): void {
    for (const resolve of pendingActionResolvers.values()) {
      resolve({ ok: false, error: "session_closed" });
    }
    pendingActionResolvers.clear();
  }

  /**
   * Takes the session it belongs to rather than reading the closure variable: a restart between
   * the tool call and its result would otherwise send this output to the *new* session.
   */
  async function handleActionToolCall(owningSession: RealtimeSession, call: RealtimeActionToolCall): Promise<void> {
    let parsedArguments: unknown;
    try {
      parsedArguments = JSON.parse(call.argumentsJson);
    } catch {
      owningSession.sendFunctionCallOutput(call.callId, JSON.stringify({ ok: false, error: "unsupported_target" }));
      return;
    }
    const request = parseActionRequest(parsedArguments);
    if (!request) {
      owningSession.sendFunctionCallOutput(call.callId, JSON.stringify({ ok: false, error: "unsupported_target" }));
      return;
    }

    const result = await new Promise<ActionResult>((resolve) => {
      pendingActionResolvers.set(call.callId, resolve);
      post({ type: "action-request", callId: call.callId, request });
    });

    if (result.ok) {
      actionsExecuted += 1;
    } else {
      actionsRefused += 1;
    }

    // The session may have been replaced or closed while the content script was executing.
    if (session !== owningSession) {
      return;
    }
    owningSession.sendFunctionCallOutput(call.callId, JSON.stringify(result));
  }

  function stopSession(): void {
    if (session) {
      const elapsedSeconds = sessionStartedAt ? (currentTime() - sessionStartedAt) / 1000 : 0;
      if (elapsedSeconds > 0) {
        post({ type: "usage-report", seconds: elapsedSeconds, actionsExecuted, actionsRefused });
      }
    }
    releasePendingActions();
    session?.close();
    session = null;
    sessionStartedAt = 0;
    actionsExecuted = 0;
    actionsRefused = 0;
  }

  function startSession(payload: Extract<BackgroundToOffscreenMessage, { type: "start-session" }>): void {
    // Tear the previous session down through the full stop path so its usage is reported and its
    // pending actions released, rather than just closing the socket.
    if (session) {
      stopSession();
    }

    sessionStartedAt = currentTime();
    actionsExecuted = 0;
    actionsRefused = 0;

    const startedSession = newSession({
      clientSecret: payload.clientSecret,
      model: payload.model,
      instructions: payload.instructions,
      actions: payload.actionsEnabled,
      callbacks: {
        onStateChange: (state) => post({ type: "session-state", state }),
        onUserTranscript: () => {},
        onAssistantText: (text) => post({ type: "assistant-text", text }),
        onActionToolCall: (call: RealtimeActionToolCall) => {
          void handleActionToolCall(startedSession, call);
        },
        onError: () => post({ type: "session-state", state: "error" }),
      },
    });
    session = startedSession;
    void startedSession.connect();
  }

  return {
    handle(message: BackgroundToOffscreenMessage): void {
      if (message.type === "start-session") {
        startSession(message);
      } else if (message.type === "stop-session") {
        stopSession();
      } else if (message.type === "action-outcome") {
        pendingActionResolvers.get(message.callId)?.(message.result);
        pendingActionResolvers.delete(message.callId);
      }
    },
    dispose(): void {
      stopSession();
    },
  };
}
