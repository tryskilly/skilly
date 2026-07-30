// Hosts the Realtime session for the extension's active tab. Persists independently of the
// background service worker's lifecycle — a worker restart just re-registers listeners, while
// this document and its live session are untouched.
//
// Chrome-only: offscreen documents do not exist on Firefox. The background feature-detects
// chrome.offscreen and never creates this document there.
import {
  RealtimeSession,
  parseActionRequest,
  type RealtimeActionToolCall,
  type ActionResult,
} from "@skilly/browser-core";
import type { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from "../../src/messages";

let session: RealtimeSession | null = null;
let sessionStartedAt = 0;
let actionsExecuted = 0;
let actionsRefused = 0;

/** callId -> resolver, for action results routed back from the content script via the background. */
const pendingActionResolvers = new Map<string, (result: ActionResult) => void>();

function post(message: OffscreenToBackgroundMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

/**
 * Resolve every in-flight action as session_closed. Dropping them instead would leave
 * handleActionToolCall awaiting a promise that can never settle, leaking the turn and never
 * answering the model's tool call.
 */
function releasePendingActions(): void {
  for (const resolve of pendingActionResolvers.values()) {
    resolve({ ok: false, error: "session_closed" });
  }
  pendingActionResolvers.clear();
}

function startSession(payload: Extract<BackgroundToOffscreenMessage, { type: "start-session" }>): void {
  // Tear the previous session down fully before replacing it, so its pending actions can't
  // resolve against the new session's tool calls.
  if (session) {
    stopSession();
  }

  sessionStartedAt = Date.now();
  actionsExecuted = 0;
  actionsRefused = 0;

  const startedSession = new RealtimeSession({
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

/**
 * Takes the session it belongs to rather than reading the module-level `session`: a restart
 * between the tool call and its result would otherwise send this output to the *new* session.
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
    const elapsedSeconds = sessionStartedAt ? (Date.now() - sessionStartedAt) / 1000 : 0;
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

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type === "start-session") {
    startSession(message);
  } else if (message.type === "stop-session") {
    stopSession();
  } else if (message.type === "action-outcome") {
    pendingActionResolvers.get(message.callId)?.(message.result);
    pendingActionResolvers.delete(message.callId);
  }
  return false;
});

// The document can be torn down by the browser; report the usage accrued so far rather than
// losing the whole session's minutes.
globalThis.addEventListener("pagehide", () => stopSession());
