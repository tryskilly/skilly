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
  onError: (message: string) => void;
}

export interface RealtimeConfig {
  clientSecret: string;
  model: string;
  instructions: string;
  callbacks: RealtimeCallbacks;
  realtimeBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

export class RealtimeSession {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private microphoneStream: MediaStream | null = null;
  private assistantText = "";
  private closed = false;

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

  private sendSessionUpdate(): void {
    if (this.closed) {
      return;
    }
    this.dataChannel?.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model: this.config.model,
          instructions: this.config.instructions,
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
        },
      }),
    );
  }

  private handleServerEvent(raw: string): void {
    if (this.closed) {
      return;
    }
    let event: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case "response.created":
        this.assistantText = "";
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
      case "error":
        this.config.callbacks.onError(event.error?.message ?? "realtime error");
        break;
      default:
        break;
    }
  }
}
