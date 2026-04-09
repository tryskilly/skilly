// MARK: - Skilly
//
//  OpenAIRealtimeClient.swift
//  leanring-buddy
//
//  WebSocket client for the OpenAI Realtime API. Handles session management,
//  audio streaming, image/screenshot input, and audio response playback.
//
//  This replaces the entire STT → LLM → TTS pipeline with a single WebSocket:
//    Audio in + Screenshots → OpenAI (STT + Vision + LLM + TTS) → Audio out
//
//  Protocol: JSON events over WebSocket. Audio is base64-encoded PCM16.
//  Endpoint: wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview
//
//  See: https://developers.openai.com/api/docs/guides/realtime-websocket
//

import AVFoundation
import Combine
import Foundation

// MARK: - Response Events

enum OpenAIRealtimeEvent {
    case sessionCreated
    case audioChunk(Data)               // PCM16 24kHz audio delta
    case audioTranscriptDelta(String)    // Text transcript of model's speech
    case inputTranscriptDone(String)     // Transcript of what the user said (STT result)
    case responseDone
    case error(String)
}

// MARK: - Client

@MainActor
final class OpenAIRealtimeClient: ObservableObject {

    private static let workerBaseURL = "https://skilly-proxy.eng-mohamedszaied.workers.dev"
    private static let realtimeEndpoint = "wss://api.openai.com/v1/realtime"
    private static let defaultModel = "gpt-4o-realtime-preview"

    static let availableVoices = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]

    @Published private(set) var isConnected = false
    @Published private(set) var isModelSpeaking = false

    let eventPublisher = PassthroughSubject<OpenAIRealtimeEvent, Never>()

    private var webSocketTask: URLSessionWebSocketTask?
    private var sessionCreatedContinuation: CheckedContinuation<Void, Error>?

    // MARK: - Token Relay

    private struct OpenAITokenResponse: Codable {
        let apiKey: String
        let model: String
    }

    private var cachedToken: OpenAITokenResponse?

    private func fetchToken() async throws -> OpenAITokenResponse {
        if let cached = cachedToken { return cached }

        let url = URL(string: "\(Self.workerBaseURL)/openai/token")!
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            throw OpenAIRealtimeError.connectionFailed("Token relay failed (HTTP \(statusCode)): \(body)")
        }

        let tokenResponse = try JSONDecoder().decode(OpenAITokenResponse.self, from: data)
        cachedToken = tokenResponse
        return tokenResponse
    }

    // MARK: - Connection

    func connect(
        systemPrompt: String? = nil,
        voiceName: String = "coral"
    ) async throws {
        let token = try await fetchToken()
        print("🔑 OpenAI Realtime: token fetched, model=\(token.model)")

        guard let url = URL(string: "\(Self.realtimeEndpoint)?model=\(token.model)") else {
            throw OpenAIRealtimeError.connectionFailed("Invalid URL")
        }

        print("🔌 OpenAI Realtime: connecting to WebSocket...")

        // OpenAI uses Authorization header, not query parameter
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("realtime=v1", forHTTPHeaderField: "OpenAI-Beta")
        request.timeoutInterval = 30

        let delegate = RealtimeWebSocketDelegate()
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)

        let task = session.webSocketTask(with: request)
        self.webSocketTask = task
        task.resume()

        // Wait for WebSocket handshake
        try await delegate.waitForOpen(timeout: 15)
        print("🔌 OpenAI Realtime: WebSocket handshake complete")

        // Start receiving events
        startReceiving()

        // Wait for session.created event
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { @MainActor in
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    self.sessionCreatedContinuation = continuation
                }
            }
            group.addTask {
                try await Task.sleep(for: .seconds(10))
                throw OpenAIRealtimeError.connectionFailed("Session creation timed out")
            }
            try await group.next()
            group.cancelAll()
        }

        // Update session with system prompt, voice, and language
        let sessionUpdate: [String: Any] = [
            "type": "session.update",
            "session": [
                "instructions": (systemPrompt ?? "You are a helpful assistant.") + "\n\nCRITICAL LANGUAGE RULE: You MUST always respond in English. All your spoken responses must be in English regardless of what language you think you hear. The user speaks English. Never respond in Spanish, Portuguese, or any other language unless the user explicitly asks you to.",
                "voice": voiceName,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": [
                    "model": "gpt-4o-mini-transcribe",
                    "language": "en"
                ],
                "turn_detection": [
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 800
                ]
            ]
        ]

        try await sendEvent(sessionUpdate)

        isConnected = true
        print("🟢 OpenAI Realtime: connected and session configured")
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        isModelSpeaking = false
        cachedToken = nil
        print("🔴 OpenAI Realtime: disconnected")
    }

    // MARK: - Audio Input

    /// Append a chunk of PCM16 mono 16kHz audio to the input buffer.
    func appendAudioChunk(_ pcm16Data: Data) {
        guard isConnected else { return }

        let event: [String: Any] = [
            "type": "input_audio_buffer.append",
            "audio": pcm16Data.base64EncodedString()
        ]

        Task { try? await sendEvent(event) }
    }

    /// Commit the audio buffer and request a response.
    /// Call this when the user releases the push-to-talk key.
    func commitAudioAndRespond() {
        guard isConnected else { return }

        // Commit the audio buffer
        let commitEvent: [String: Any] = ["type": "input_audio_buffer.commit"]

        // Request a response
        let responseEvent: [String: Any] = ["type": "response.create"]

        Task {
            try? await sendEvent(commitEvent)
            try? await sendEvent(responseEvent)
        }
    }

    /// Clear the audio buffer (e.g., user cancelled).
    func clearAudioBuffer() {
        guard isConnected else { return }
        let event: [String: Any] = ["type": "input_audio_buffer.clear"]
        Task { try? await sendEvent(event) }
    }

    // MARK: - Cancel / Interrupt

    /// Cancel the current response. Stops the model from generating
    /// more audio/text, saving tokens. Call this when the user presses
    /// push-to-talk again while a response is playing.
    func cancelResponse() {
        guard isConnected else { return }
        let event: [String: Any] = ["type": "response.cancel"]
        Task {
            try? await sendEvent(event)
            print("🛑 OpenAI Realtime: response cancelled")
        }
        isModelSpeaking = false
    }

    // MARK: - Image/Screenshot Input

    /// Send a screenshot as part of the conversation. The model can see
    /// the image and reference it in its response.
    func sendScreenshot(_ jpegData: Data, withText text: String? = nil) {
        guard isConnected else { return }

        let dataURL = "data:image/jpeg;base64,\(jpegData.base64EncodedString())"

        var contentParts: [[String: Any]] = [
            [
                "type": "input_image",
                "image_url": dataURL
            ]
        ]

        if let text, !text.isEmpty {
            contentParts.insert(["type": "input_text", "text": text], at: 0)
        }

        let event: [String: Any] = [
            "type": "conversation.item.create",
            "item": [
                "type": "message",
                "role": "user",
                "content": contentParts
            ]
        ]

        Task {
            try? await sendEvent(event)
            print("📸 OpenAI Realtime: sent screenshot (\(jpegData.count / 1024)KB)")
        }
    }

    // MARK: - Private — Sending

    private func sendEvent(_ event: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: event)
        guard let jsonString = String(data: data, encoding: .utf8) else {
            throw OpenAIRealtimeError.encodingFailed
        }
        try await webSocketTask?.send(.string(jsonString))
    }

    // MARK: - Private — Receiving

    private func startReceiving() {
        webSocketTask?.receive { [weak self] result in
            Task { @MainActor in
                guard let self else { return }

                switch result {
                case .success(let message):
                    self.handleMessage(message)
                    self.startReceiving()

                case .failure(let error):
                    print("⚠️ OpenAI Realtime: WebSocket error: \(error)")

                    if let continuation = self.sessionCreatedContinuation {
                        self.sessionCreatedContinuation = nil
                        continuation.resume(throwing: OpenAIRealtimeError.connectionFailed(error.localizedDescription))
                    }

                    if self.isConnected {
                        self.eventPublisher.send(.error(error.localizedDescription))
                    }
                    self.isConnected = false
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .string(let text):
            guard let textData = text.data(using: .utf8) else { return }
            data = textData
        case .data(let binaryData):
            data = binaryData
        @unknown default:
            return
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let eventType = json["type"] as? String else { return }

        switch eventType {
        case "session.created":
            print("📩 OpenAI Realtime: session.created")
            sessionCreatedContinuation?.resume()
            sessionCreatedContinuation = nil

        case "session.updated":
            print("📩 OpenAI Realtime: session.updated")

        case "response.audio.delta":
            if let audioBase64 = json["delta"] as? String,
               let audioData = Data(base64Encoded: audioBase64) {
                isModelSpeaking = true
                eventPublisher.send(.audioChunk(audioData))
            }

        case "response.audio_transcript.delta":
            if let delta = json["delta"] as? String {
                eventPublisher.send(.audioTranscriptDelta(delta))
            }

        case "conversation.item.input_audio_transcription.completed":
            if let transcript = json["transcript"] as? String {
                eventPublisher.send(.inputTranscriptDone(transcript))
                print("🗣️ OpenAI Realtime STT: \"\(transcript.prefix(80))\"")
            }

        case "response.done":
            isModelSpeaking = false
            eventPublisher.send(.responseDone)
            print("🎯 OpenAI Realtime: response complete")

        case "error":
            if let errorObj = json["error"] as? [String: Any],
               let errorMessage = errorObj["message"] as? String {
                print("⚠️ OpenAI Realtime error: \(errorMessage)")
                eventPublisher.send(.error(errorMessage))
            }

        case "input_audio_buffer.speech_started":
            print("🎙️ OpenAI Realtime: speech detected")

        case "input_audio_buffer.speech_stopped":
            print("🎙️ OpenAI Realtime: speech ended")

        case "input_audio_buffer.committed":
            print("📩 OpenAI Realtime: audio buffer committed")

        default:
            // Log unknown events for debugging
            if !eventType.starts(with: "response.") && !eventType.starts(with: "rate_limits") {
                print("📩 OpenAI Realtime: \(eventType)")
            }
        }
    }

    // MARK: - Errors

    enum OpenAIRealtimeError: Error, LocalizedError {
        case connectionFailed(String)
        case encodingFailed

        var errorDescription: String? {
            switch self {
            case .connectionFailed(let detail): return "OpenAI Realtime connection failed: \(detail)"
            case .encodingFailed: return "Failed to encode event"
            }
        }
    }
}

// MARK: - WebSocket Delegate

private final class RealtimeWebSocketDelegate: NSObject, URLSessionWebSocketDelegate, Sendable {
    private let openBox = ContinuationBox()

    func waitForOpen(timeout: TimeInterval) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { continuation in
                    self.openBox.store(continuation)
                }
            }
            group.addTask {
                try await Task.sleep(for: .seconds(timeout))
                throw OpenAIRealtimeClient.OpenAIRealtimeError.connectionFailed("WebSocket handshake timed out")
            }
            try await group.next()
            group.cancelAll()
        }
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        print("🔌 OpenAI Realtime: WebSocket didOpen")
        openBox.resume()
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "none"
        print("🔴 OpenAI Realtime: WebSocket didClose (code: \(closeCode.rawValue), reason: \(reasonStr))")
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            print("⚠️ OpenAI Realtime: task error: \(error)")
            openBox.resumeWithError(OpenAIRealtimeClient.OpenAIRealtimeError.connectionFailed(error.localizedDescription))
        }
    }
}

// MARK: - Thread-safe Continuation Box

private final class ContinuationBox: @unchecked Sendable {
    private var continuation: CheckedContinuation<Void, Error>?
    private let lock = NSLock()
    private var isResolved = false

    func store(_ continuation: CheckedContinuation<Void, Error>) {
        lock.lock()
        if isResolved {
            lock.unlock()
            return
        }
        self.continuation = continuation
        lock.unlock()
    }

    func resume() {
        lock.lock()
        isResolved = true
        let cont = continuation
        continuation = nil
        lock.unlock()
        cont?.resume()
    }

    func resumeWithError(_ error: Error) {
        lock.lock()
        isResolved = true
        let cont = continuation
        continuation = nil
        lock.unlock()
        cont?.resume(throwing: error)
    }
}
