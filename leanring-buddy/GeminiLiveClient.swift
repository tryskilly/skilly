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
    private let urlSession: URLSession
    private var setupContinuation: CheckedContinuation<Void, Error>?

    /// Cached token from the Worker — avoids fetching on every session.
    private var cachedGeminiToken: GeminiTokenResponse?

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300  // 5 min — sessions can be long
        config.timeoutIntervalForResource = 900 // 15 min — Gemini session limit
        self.urlSession = URLSession(configuration: config)
    }

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

        // Build WebSocket URL with API key
        guard let url = URL(string: "\(token.websocketBaseURL)?key=\(token.apiKey)") else {
            throw GeminiLiveError.invalidURL
        }

        let task = urlSession.webSocketTask(with: url)
        self.webSocketTask = task
        task.resume()

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
                    response_modalities: ["AUDIO", "TEXT"],
                    speech_config: .init(
                        voice_config: .init(
                            prebuilt_voice_config: .init(voice_name: voiceName)
                        )
                    )
                ),
                system_instruction: systemInstruction
            )
        )

        try await sendJSON(setupMessage)

        // Wait for setupComplete
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            self.setupContinuation = continuation
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

    // MARK: - Sending Audio

    /// Send a chunk of PCM16 mono 16kHz audio to the model.
    /// Audio data should be raw PCM16 bytes (not WAV, no headers).
    func sendAudioChunk(_ pcm16Data: Data) {
        guard isConnected else { return }

        let message = GeminiLiveRealtimeInput(
            realtimeInput: .init(
                mediaChunks: [.init(
                    mimeType: "audio/pcm;rate=16000",
                    data: pcm16Data.base64EncodedString()
                )]
            )
        )

        Task { try? await sendJSON(message) }
    }

    // MARK: - Sending Images

    /// Send a screenshot/image to the model mid-session.
    /// The model will incorporate the image into its understanding.
    func sendImage(_ jpegData: Data) {
        guard isConnected else { return }

        let message = GeminiLiveRealtimeInput(
            realtimeInput: .init(
                mediaChunks: [.init(
                    mimeType: "image/jpeg",
                    data: jpegData.base64EncodedString()
                )]
            )
        )

        Task {
            try? await sendJSON(message)
            print("📸 Gemini Live: sent image (\(jpegData.count / 1024)KB)")
        }
    }

    // MARK: - Turn Management

    /// Signal that the user has finished speaking (key released).
    func sendTurnComplete() {
        guard isConnected else { return }
        Task { try? await sendJSON(GeminiLiveClientTurnComplete.message) }
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
                    if self.isConnected {
                        print("⚠️ Gemini Live: WebSocket error: \(error)")
                        self.responseEventPublisher.send(.error(error.localizedDescription))
                    }
                    self.isConnected = false
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8) else { return }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
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
