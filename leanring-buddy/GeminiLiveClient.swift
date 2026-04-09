// MARK: - Skilly
//
//  GeminiLiveClient.swift
//  leanring-buddy
//
//  Low-level WebSocket client for the Gemini Live API (BidiGenerateContent).
//  Handles connection setup, audio/image streaming, and response parsing.
//
//  Protocol: JSON over WebSocket. Audio is base64-encoded PCM16.
//  Endpoint: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
//
//  See: https://ai.google.dev/gemini-api/docs/live
//

import Combine
import Foundation

// MARK: - Message Types

/// Configuration sent as the first message after WebSocket connects.
struct GeminiLiveSetupMessage: Encodable {
    let setup: GeminiLiveSetup

    struct GeminiLiveSetup: Encodable {
        let model: String
        let generation_config: GenerationConfig
        let system_instruction: SystemInstruction?

        struct GenerationConfig: Encodable {
            let response_modalities: [String]
            let speech_config: SpeechConfig?

            struct SpeechConfig: Encodable {
                let voice_config: VoiceConfig

                struct VoiceConfig: Encodable {
                    let prebuilt_voice_config: PrebuiltVoiceConfig

                    struct PrebuiltVoiceConfig: Encodable {
                        let voice_name: String
                    }
                }
            }
        }

        struct SystemInstruction: Encodable {
            let parts: [Part]

            struct Part: Encodable {
                let text: String
            }
        }
    }
}

/// Streams audio or image data to the model during a live session.
struct GeminiLiveRealtimeInput: Encodable {
    let realtimeInput: RealtimeInput

    struct RealtimeInput: Encodable {
        let mediaChunks: [MediaChunk]

        struct MediaChunk: Encodable {
            let mimeType: String
            let data: String  // base64-encoded
        }
    }
}

/// Signals that the user's turn is complete (key released).
struct GeminiLiveClientTurnComplete: Encodable {
    let clientContent: ClientContent

    struct ClientContent: Encodable {
        let turnComplete: Bool
    }

    static let message = GeminiLiveClientTurnComplete(
        clientContent: ClientContent(turnComplete: true)
    )
}

/// Parsed response from the Gemini Live API.
enum GeminiLiveResponseEvent {
    case setupComplete
    case audioChunk(Data)           // PCM16 mono 24kHz audio
    case textChunk(String)          // Text transcript of model speech
    case turnComplete
    case interrupted
    case error(String)
}

// MARK: - Client

@MainActor
final class GeminiLiveClient: ObservableObject {

    private static let workerBaseURL = "https://skilly-proxy.eng-mohamedszaied.workers.dev"

    /// Available Gemini Live voices.
    static let availableVoices = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"]

    @Published private(set) var isConnected = false
    @Published private(set) var isModelSpeaking = false

    /// Fires for each response event from the model.
    let responseEventPublisher = PassthroughSubject<GeminiLiveResponseEvent, Never>()

    private var webSocketTask: URLSessionWebSocketTask?
    private var setupContinuation: CheckedContinuation<Void, Error>?

    /// Cached token from the Worker — avoids fetching on every session.
    private var cachedGeminiToken: GeminiTokenResponse?

    // MARK: - Token Relay

    private struct GeminiTokenResponse: Codable {
        let apiKey: String
        let websocketBaseURL: String
        let model: String
    }

    /// Fetches the Gemini API key and WebSocket URL from the Worker proxy.
    /// The API key is a Worker secret — never stored in the app binary.
    private func fetchGeminiToken() async throws -> GeminiTokenResponse {
        if let cached = cachedGeminiToken { return cached }

        let url = URL(string: "\(Self.workerBaseURL)/gemini/token")!
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            throw GeminiLiveError.setupFailed("Token relay failed (HTTP \(statusCode)): \(body)")
        }

        let tokenResponse = try JSONDecoder().decode(GeminiTokenResponse.self, from: data)
        cachedGeminiToken = tokenResponse
        return tokenResponse
    }

    // MARK: - Connection

    /// Opens a WebSocket to the Gemini Live API, sends the setup message,
    /// and waits for setupComplete before returning. Fetches the API key
    /// from the Worker proxy (token relay pattern).
    func connect(
        systemPrompt: String? = nil,
        voiceName: String = "Kore"
    ) async throws {
        // Fetch API key from Worker
        let token = try await fetchGeminiToken()
        print("🔑 Gemini Live: token fetched, model=\(token.model)")

        // Build WebSocket URL with API key
        guard let url = URL(string: "\(token.websocketBaseURL)?key=\(token.apiKey)") else {
            throw GeminiLiveError.invalidURL
        }

        print("🔌 Gemini Live: connecting to WebSocket...")

        // Use a dedicated URLSession with a delegate to detect WebSocket open
        let delegate = GeminiWebSocketDelegate()
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 30
        let delegateSession = URLSession(configuration: sessionConfig, delegate: delegate, delegateQueue: nil)

        let task = delegateSession.webSocketTask(with: url)
        self.webSocketTask = task
        task.resume()

        // Wait for the WebSocket handshake to complete
        try await delegate.waitForOpen(timeout: 15)
        print("🔌 Gemini Live: WebSocket handshake complete")

        // Start receiving messages
        startReceiving()

        // Send setup message
        let systemInstruction: GeminiLiveSetupMessage.GeminiLiveSetup.SystemInstruction?
        if let systemPrompt, !systemPrompt.isEmpty {
            systemInstruction = .init(parts: [.init(text: systemPrompt)])
        } else {
            systemInstruction = nil
        }

        let setupMessage = GeminiLiveSetupMessage(
            setup: .init(
                model: token.model,
                generation_config: .init(
                    response_modalities: ["AUDIO"],
                    speech_config: .init(
                        voice_config: .init(
                            prebuilt_voice_config: .init(voice_name: voiceName)
                        )
                    )
                ),
                system_instruction: systemInstruction
            )
        )

        print("📤 Gemini Live: sending setup message...")
        try await sendJSON(setupMessage)

        // Wait for setupComplete with a timeout
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { @MainActor in
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    self.setupContinuation = continuation
                }
            }
            group.addTask {
                try await Task.sleep(for: .seconds(15))
                throw GeminiLiveError.setupFailed("Setup response timed out after 15 seconds")
            }
            try await group.next()
            group.cancelAll()
        }

        isConnected = true
        print("🟢 Gemini Live: connected and setup complete")
    }

    /// Disconnect the WebSocket session.
    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        isModelSpeaking = false
        print("🔴 Gemini Live: disconnected")
    }

    // MARK: - Sending User Messages

    /// Send a text message to the model via clientContent.
    /// The model responds with streaming audio + text.
    ///
    /// Note: The native-audio model does not support inline images.
    /// For screenshot-based interactions, use the classic pipeline
    /// or describe the screenshot in text.
    func sendTextMessage(_ text: String) {
        guard isConnected else { return }

        let message: [String: Any] = [
            "clientContent": [
                "turns": [
                    ["role": "user", "parts": [["text": text]]]
                ],
                "turnComplete": true
            ]
        ]

        Task {
            guard let data = try? JSONSerialization.data(withJSONObject: message),
                  let jsonString = String(data: data, encoding: .utf8) else { return }
            try? await webSocketTask?.send(.string(jsonString))
            print("📤 Gemini Live: sent user message (\(text.prefix(50))...)")
        }
    }

    // MARK: - Private — Sending

    private func sendJSON<T: Encodable>(_ message: T) async throws {
        let data = try JSONEncoder().encode(message)
        guard let jsonString = String(data: data, encoding: .utf8) else {
            throw GeminiLiveError.encodingFailed
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
                    self.startReceiving()  // Continue receiving

                case .failure(let error):
                    print("⚠️ Gemini Live: WebSocket error: \(error)")

                    // If the setup continuation is still pending, fail it
                    if let continuation = self.setupContinuation {
                        self.setupContinuation = nil
                        continuation.resume(throwing: GeminiLiveError.setupFailed("WebSocket connection failed: \(error.localizedDescription)"))
                    }

                    if self.isConnected {
                        self.responseEventPublisher.send(.error(error.localizedDescription))
                    }
                    self.isConnected = false
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        // Gemini Live sends responses as either text or binary frames.
        // Both contain JSON — binary frames are just UTF-8 encoded JSON.
        let data: Data
        switch message {
        case .string(let text):
            guard let textData = text.data(using: .utf8) else { return }
            data = textData
        case .data(let binaryData):
            data = binaryData
        @unknown default:
            print("⚠️ Gemini Live: received unknown WebSocket message type")
            return
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            let preview = String(data: data.prefix(200), encoding: .utf8) ?? "binary"
            print("⚠️ Gemini Live: failed to parse JSON: \(preview)")
            return
        }

        // Log top-level keys for debugging
        let keys = json.keys.sorted().joined(separator: ", ")
        if json["serverContent"] == nil {
            print("📩 Gemini Live: received message with keys: [\(keys)]")
        }

        // Setup complete
        if json["setupComplete"] != nil {
            setupContinuation?.resume()
            setupContinuation = nil
            return
        }

        // Server content (model response)
        if let serverContent = json["serverContent"] as? [String: Any] {
            // Turn complete
            if serverContent["turnComplete"] as? Bool == true {
                isModelSpeaking = false
                responseEventPublisher.send(.turnComplete)
                return
            }

            // Interrupted
            if serverContent["interrupted"] as? Bool == true {
                isModelSpeaking = false
                responseEventPublisher.send(.interrupted)
                return
            }

            // Model turn with parts
            if let modelTurn = serverContent["modelTurn"] as? [String: Any],
               let parts = modelTurn["parts"] as? [[String: Any]] {

                isModelSpeaking = true

                for part in parts {
                    // Audio part
                    if let inlineData = part["inlineData"] as? [String: Any],
                       let base64Audio = inlineData["data"] as? String,
                       let audioData = Data(base64Encoded: base64Audio) {
                        responseEventPublisher.send(.audioChunk(audioData))
                    }

                    // Text part
                    if let text = part["text"] as? String {
                        responseEventPublisher.send(.textChunk(text))
                    }
                }
            }
        }
    }

    // MARK: - Errors

    enum GeminiLiveError: Error, LocalizedError {
        case invalidURL
        case encodingFailed
        case setupFailed(String)
        case notConnected

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid Gemini Live WebSocket URL"
            case .encodingFailed: return "Failed to encode message"
            case .setupFailed(let detail): return "Gemini Live setup failed: \(detail)"
            case .notConnected: return "Not connected to Gemini Live"
            }
        }
    }
}

// MARK: - WebSocket Delegate

/// URLSession delegate that detects when the WebSocket handshake completes.
/// Used to ensure we don't send messages before the connection is ready.
private final class GeminiWebSocketDelegate: NSObject, URLSessionWebSocketDelegate, Sendable {
    private let openContinuation = UnsafeContinuationBox()

    /// Waits for the WebSocket to open, with a timeout.
    func waitForOpen(timeout: TimeInterval) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { continuation in
                    self.openContinuation.store(continuation)
                }
            }
            group.addTask {
                try await Task.sleep(for: .seconds(timeout))
                throw GeminiLiveClient.GeminiLiveError.setupFailed("WebSocket handshake timed out after \(Int(timeout))s")
            }
            try await group.next()
            group.cancelAll()
        }
    }

    nonisolated func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        print("🔌 Gemini Live: WebSocket didOpen (protocol: \(`protocol` ?? "none"))")
        openContinuation.resume()
    }

    nonisolated func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        let reasonString = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "none"
        print("🔴 Gemini Live: WebSocket didClose (code: \(closeCode.rawValue), reason: \(reasonString))")
    }

    nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if let error {
            print("⚠️ Gemini Live: URLSession task error: \(error)")
            openContinuation.resumeWithError(GeminiLiveClient.GeminiLiveError.setupFailed(error.localizedDescription))
        }
    }
}

/// Thread-safe container for a CheckedContinuation, since the URLSession
/// delegate callbacks arrive on arbitrary threads.
private final class UnsafeContinuationBox: @unchecked Sendable {
    private var continuation: CheckedContinuation<Void, Error>?
    private let lock = NSLock()
    private var isResolved = false

    func store(_ continuation: CheckedContinuation<Void, Error>) {
        lock.lock()
        if isResolved {
            lock.unlock()
            // Already resolved before store was called — resume immediately
            // (This handles the race where didOpen fires before store)
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
