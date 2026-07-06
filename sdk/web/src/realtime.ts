// OpenAI Realtime session over browser WebRTC. Unlike the desktop app (which
// streams PCM over a WebSocket), the browser uses WebRTC: the peer connection
// carries the mic up and the model's voice down natively, and a data channel
// carries JSON events (instructions, transcripts, and the [POINT] tags we feed
// to the pointing engine). The ephemeral client secret comes from the backend
// (Phase 8.4); the raw OpenAI key never reaches the browser.
//
// This module is browser-runtime (WebRTC + getUserMedia + Web Audio) and is
// validated by build + a live session, not by headless unit tests.

export type RealtimeState = "connecting" | "live" | "closed" | "error";

export interface RealtimeCallbacks {
  onStateChange: (state: RealtimeState) => void;
  /** The user's speech transcribed (final). */
  onUserTranscript: (text: string) => void;
  /** The assistant's response text so far (accumulated; may contain [POINT] tags). */
  onAssistantText: (fullText: string) => void;
  /** A new model response started; used to reset per-turn client-side guards. */
  onResponseCreated?: () => void;
  /** The model asked the client to execute a local action tool. */
  onActionToolCall?: (call: RealtimeActionToolCall) => void;
  onError: (message: string) => void;
}

export interface RealtimeConfig {
  clientSecret: string;
  model: string;
  instructions: string;
  callbacks: RealtimeCallbacks;
  realtimeBaseUrl?: string;
  fetchImpl?: typeof fetch;
  actions?: boolean;
}

export interface RealtimeActionToolCall {
  callId: string;
  name: "perform_action";
  argumentsJson: string;
}

const DEFAULT_REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

export const PERFORM_ACTION_TOOL = {
  type: "function",
  name: "perform_action",
  description:
    "Perform a single UI action on the page for the user. Only call this when the user asked you to do the step for them. Set destructive=true if the action deletes, sends, pays for, or irreversibly changes something.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["click", "fill"] },
      element_id: { type: "string", description: "The id of the element from the page digest" },
      value: { type: "string", description: "Text to fill (fill action only)" },
      destructive: { type: "boolean" },
    },
    required: ["action", "element_id", "destructive"],
  },
} as const;

export function buildSessionUpdatePayload(config: Pick<RealtimeConfig, "model" | "instructions" | "actions">): object {
  const session: Record<string, unknown> = {
    type: "realtime",
    model: config.model,
    instructions: config.instructions,
    output_modalities: ["audio"],
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: { type: "server_vad" },
      },
      output: {
        format: { type: "audio/pcm", rate: 24000 },
      },
    },
  };
  if (config.actions) {
    session.tools = [PERFORM_ACTION_TOOL];
  }
  return { type: "session.update", session };
}

export class RealtimeSession {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private microphoneStream: MediaStream | null = null;
  private assistantText = "";
  private closed = false;
  private handledToolCallIds = new Set<string>();

  constructor(private readonly config: RealtimeConfig) {}

  /** Establish the WebRTC session: mic up, model voice down, events over the data channel. */
  async connect(): Promise<void> {
    const { callbacks } = this.config;
    if (this.closed) {
      return;
    }
    callbacks.onStateChange("connecting");
    try {
      const peerConnection = new RTCPeerConnection();
      this.peerConnection = peerConnection;

      // Play the model's voice through an autoplay audio element.
      this.audioElement = new Audio();
      this.audioElement.autoplay = true;
      peerConnection.ontrack = (event) => {
        if (this.audioElement) {
          this.audioElement.srcObject = event.streams[0] ?? null;
        }
      };

      // Capture the mic and send it up.
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.closed) {
        this.close();
        return;
      }
      for (const track of this.microphoneStream.getTracks()) {
        peerConnection.addTrack(track, this.microphoneStream);
      }

      // Event channel: instructions out, transcripts + [POINT] tags in.
      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.dataChannel = dataChannel;
      dataChannel.onopen = () => {
        if (this.closed) {
          return;
        }
        this.sendSessionUpdate();
        callbacks.onStateChange("live");
      };
      dataChannel.onmessage = (event) => this.handleServerEvent(String(event.data));

      // SDP offer/answer, authenticated with the ephemeral client secret.
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const fetchImpl = this.config.fetchImpl ?? fetch;
      const sdpResponse = await fetchImpl(this.config.realtimeBaseUrl ?? DEFAULT_REALTIME_URL, {
        method: "POST",
        body: offer.sdp ?? "",
        headers: {
          Authorization: `Bearer ${this.config.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed (${sdpResponse.status})`);
      }
      const answerSdp = await sdpResponse.text();
      if (this.closed) {
        return;
      }
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (connectError) {
      if (!this.closed) {
        callbacks.onStateChange("error");
        callbacks.onError(connectError instanceof Error ? connectError.message : "connect failed");
      }
      this.close();
    }
  }

  /** Tear down the session and release the mic. */
  close(): void {
    const wasClosed = this.closed;
    this.closed = true;
    this.dataChannel?.close();
    this.dataChannel = null;
    for (const track of this.microphoneStream?.getTracks() ?? []) {
      track.stop();
    }
    this.microphoneStream = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
    if (!wasClosed) {
      this.config.callbacks.onStateChange("closed");
    }
  }

  sendFunctionCallOutput(callId: string, output: string): void {
    if (this.closed || this.dataChannel?.readyState !== "open") {
      return;
    }
    this.dataChannel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output,
        },
      }),
    );
    this.dataChannel.send(JSON.stringify({ type: "response.create" }));
  }

  private sendSessionUpdate(): void {
    if (this.closed) {
      return;
    }
    this.dataChannel?.send(JSON.stringify(buildSessionUpdatePayload(this.config)));
  }

  private handleServerEvent(raw: string): void {
    if (this.closed) {
      return;
    }
    let event: {
      type?: string;
      delta?: string;
      transcript?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
      response?: { output?: Array<Record<string, unknown>> };
      error?: { message?: string };
    };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case "response.created":
        this.assistantText = "";
        this.handledToolCallIds.clear();
        this.config.callbacks.onResponseCreated?.();
        break;
      // Accept the GA transcript/text delta events (names have shifted across
      // versions; handle the common set tolerantly).
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
      case "response.text.delta":
        this.assistantText += event.delta ?? "";
        this.config.callbacks.onAssistantText(this.assistantText);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          this.config.callbacks.onUserTranscript(event.transcript);
        }
        break;
      case "response.function_call_arguments.done":
        this.forwardActionToolCall(event);
        break;
      case "response.done":
        this.forwardDoneFunctionCallItems(event.response?.output ?? []);
        break;
      case "error":
        this.config.callbacks.onError(event.error?.message ?? "realtime error");
        break;
      default:
        break;
    }
  }

  private forwardActionToolCall(event: { call_id?: string; name?: string; arguments?: string }): void {
    if (event.name !== "perform_action" || !event.call_id || typeof event.arguments !== "string") {
      return;
    }
    if (this.handledToolCallIds.has(event.call_id)) {
      return;
    }
    this.handledToolCallIds.add(event.call_id);
    this.config.callbacks.onActionToolCall?.({
      callId: event.call_id,
      name: "perform_action",
      argumentsJson: event.arguments,
    });
  }

  private forwardDoneFunctionCallItems(items: Array<Record<string, unknown>>): void {
    for (const item of items) {
      if (item.type !== "function_call" || item.name !== "perform_action") {
        continue;
      }
      this.forwardActionToolCall({
        call_id: typeof item.call_id === "string" ? item.call_id : undefined,
        name: "perform_action",
        arguments: typeof item.arguments === "string" ? item.arguments : undefined,
      });
    }
  }
}
