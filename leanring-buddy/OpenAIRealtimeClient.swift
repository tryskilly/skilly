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

// MARK: - Realtime Usage Model

struct RealtimeUsage: Codable {
    let input_tokens: Int?
    let output_tokens: Int?
    let total_tokens: Int?
    let input_token_details: InputTokenDetails?
    let output_token_details: OutputTokenDetails?

    struct InputTokenDetails: Codable {
        let cached_tokens: Int?
        let audio_tokens: Int?
    }

    struct OutputTokenDetails: Codable {
        let audio_tokens: Int?
        let reasoning_tokens: Int?
    }

    var audio_input_tokens: Int? { input_token_details?.audio_tokens }
    var audio_output_tokens: Int? { output_token_details?.audio_tokens }
    var cached_input_tokens: Int? { input_token_details?.cached_tokens }
    var text_input_tokens: Int? {
        guard let total = input_tokens else { return nil }
        return total - (cached_input_tokens ?? 0) - (audio_input_tokens ?? 0)
    }
    var text_output_tokens: Int? {
        guard let total = output_tokens else { return nil }
        return total - (audio_output_tokens ?? 0)
    }

    static func parse(from json: [String: Any]) -> RealtimeUsage? {
        guard let raw = json["usage"] as? [String: Any] else { return nil }
        return RealtimeUsage(
            input_tokens: raw["input_tokens"] as? Int,
            output_tokens: raw["output_tokens"] as? Int,
            total_tokens: raw["total_tokens"] as? Int,
            input_token_details: {
                guard let d = raw["input_token_details"] as? [String: Any] else { return nil }
                return InputTokenDetails(
                    cached_tokens: d["cached_tokens"] as? Int,
                    audio_tokens: d["audio_tokens"] as? Int
                )
            }(),
            output_token_details: {
                guard let d = raw["output_token_details"] as? [String: Any] else { return nil }
                return OutputTokenDetails(
                    audio_tokens: d["audio_tokens"] as? Int,
                    reasoning_tokens: d["reasoning_tokens"] as? Int
                )
            }()
        )
    }
}

// MARK: - Response Events

enum OpenAIRealtimeEvent {
    case sessionCreated
    case audioChunk(Data)               // PCM16 24kHz audio delta
    case audioTranscriptDelta(String)    // Text transcript of model's speech
    case inputTranscriptDone(String)     // Transcript of what the user said (STT result)
    case responseDone(RealtimeUsage?)   // Includes token usage from response.done
    case functionCallDone(name: String, argumentsJSON: String, callId: String) // Model called a tool
    case error(String)
}

// MARK: - Client

@MainActor
final class OpenAIRealtimeClient: ObservableObject {

    private static let realtimeEndpoint = "wss://api.openai.com/v1/realtime"
    private static let defaultModel = "gpt-4o-realtime-preview"

    static let availableVoices = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]

    @Published private(set) var isConnected = false
    @Published private(set) var isModelSpeaking = false
    @Published private(set) var currentModel: String = "unknown"

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

        let url = URL(string: "\(AppSettings.shared.workerBaseURL)/openai/token")!
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
        currentModel = token.model
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔑 OpenAI Realtime: token fetched, model=\(token.model)")
        #endif

        guard let url = URL(string: "\(Self.realtimeEndpoint)?model=\(token.model)") else {
            throw OpenAIRealtimeError.connectionFailed("Invalid URL")
        }

        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔌 OpenAI Realtime: connecting to WebSocket...")
        #endif

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
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔌 OpenAI Realtime: WebSocket handshake complete")
        #endif

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

        try await updateSessionConfiguration(systemPrompt: systemPrompt, voiceName: voiceName)

        isConnected = true
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🟢 OpenAI Realtime: connected and session configured")
        #endif
    }

    func updateSessionConfiguration(
        systemPrompt: String? = nil,
        voiceName: String? = nil
    ) async throws {
        guard isConnected || webSocketTask != nil else { return }

        let settings = await AppSettings.shared
        let languageCode = settings.preferredLanguage
        let languageName = AppSettings.languageName(for: languageCode)
        let autoDetect = settings.autoDetectLanguage

        let languageInstruction: String
        if autoDetect {
            languageInstruction = "\n\nLANGUAGE: Detect the language the user speaks and respond in the same language. Default to \(languageName) if unclear."
        } else {
            languageInstruction = "\n\nLANGUAGE: You MUST always respond in \(languageName). All spoken responses must be in \(languageName). Never switch to another language."
        }

        var transcriptionConfig: [String: Any] = ["model": "gpt-4o-mini-transcribe"]
        if !autoDetect {
            transcriptionConfig["language"] = languageCode
        }

        // MARK: - Skilly — point_at_element tool
        // Defining pointing as a proper function call (instead of an inline
        // [POINT:x,y:label] text tag) keeps the directive completely out of
        // the text/audio stream. gpt-realtime calls this tool alongside its
        // spoken message item, with zero TTS output for the tool arguments.
        let pointAtElementTool: [String: Any] = [
            "type": "function",
            "name": "point_at_element",
            "description": "Point the blue cursor at a UI element on the user's screen. This tool is ONLY an addition to your spoken response — it is never a replacement for speech. You must ALWAYS produce a normal spoken audio message explaining what the user should do, and then additionally call this tool in the same response to point at the element you just described. Never call this tool without also speaking. Never use this tool as your entire response. If pointing is not useful, simply do not call the tool and speak as normal. Do not mention coordinates, the word 'point', or this tool's name in your spoken response.",
            "parameters": [
                "type": "object",
                "properties": [
                    "x": [
                        "type": "integer",
                        "description": "X pixel coordinate in the screenshot's coordinate space. Origin (0,0) is the top-left corner of the image; x increases rightward."
                    ],
                    "y": [
                        "type": "integer",
                        "description": "Y pixel coordinate in the screenshot's coordinate space. Origin (0,0) is the top-left corner of the image; y increases downward."
                    ],
                    "label": [
                        "type": "string",
                        "description": "Short 1-3 word name of the element you are pointing at, for example 'Frame tool' or 'Save button'."
                    ],
                    "screen": [
                        "type": "integer",
                        "description": "1-based screen index when multiple screenshots were provided. Omit if the element is on the screen where the user's cursor currently is."
                    ]
                ],
                "required": ["x", "y", "label"]
            ]
        ]

        var sessionObject: [String: Any] = [
            "modalities": ["text", "audio"],
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_transcription": transcriptionConfig,
            "turn_detection": NSNull(),
            "tools": [pointAtElementTool],
            "tool_choice": "auto"
        ]

        if let systemPrompt {
            sessionObject["instructions"] = systemPrompt + languageInstruction
        }

        if let voiceName {
            sessionObject["voice"] = voiceName
        }

        let sessionUpdate: [String: Any] = [
            "type": "session.update",
            "session": sessionObject
        ]

        try await sendEvent(sessionUpdate)
    }

    func updateVoice(voiceName: String) async throws {
        try await updateSessionConfiguration(systemPrompt: nil, voiceName: voiceName)

        #if DEBUG
        print("🎤 OpenAI Realtime: voice updated to \(voiceName)")
        #endif
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        isModelSpeaking = false
        currentModel = "unknown"
        cachedToken = nil
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔴 OpenAI Realtime: disconnected")
        #endif
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

        // Request a response with audio output
        let responseEvent: [String: Any] = [
            "type": "response.create",
            "response": [
                "modalities": ["text", "audio"]
            ]
        ]

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

    // MARK: - Skilly — Tool call completion and forced follow-up speech

    /// Close a function call by sending a `function_call_output` item.
    /// Per the Realtime protocol, every function_call in the conversation
    /// history should have a corresponding output, so the model has a
    /// well-formed transcript on its next response. The output is opaque
    /// to us — for `point_at_element` we just acknowledge success.
    func sendFunctionCallOutput(callId: String, output: String) {
        guard isConnected else { return }

        let event: [String: Any] = [
            "type": "conversation.item.create",
            "item": [
                "type": "function_call_output",
                "call_id": callId,
                "output": output
            ]
        ]

        Task {
            try? await sendEvent(event)
            #if DEBUG
            print("🛠️ OpenAI Realtime: sent function_call_output for \(callId)")
            #endif
        }
    }

    /// Request a new response that MUST be spoken and MUST NOT call any
    /// tools. Used as a runtime recovery path when gpt-realtime emits a
    /// tool-call-only response with no audio — we detect the silence and
    /// force the model to produce the spoken explanation it should have
    /// given in the first place.
    func requestForcedSpokenResponse(instruction: String) {
        guard isConnected else { return }

        let responseEvent: [String: Any] = [
            "type": "response.create",
            "response": [
                "modalities": ["text", "audio"],
                "tool_choice": "none",
                "instructions": instruction
            ]
        ]

        Task {
            try? await sendEvent(responseEvent)
            #if DEBUG
            print("🗣️ OpenAI Realtime: requested forced spoken response")
            #endif
        }
    }

    /// Cancel the current response. Stops the model from generating
    /// more audio/text, saving tokens. Call this when the user presses
    /// push-to-talk again while a response is playing.
    func cancelResponse() {
        guard isConnected else { return }
        let event: [String: Any] = ["type": "response.cancel"]
        Task {
            try? await sendEvent(event)
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🛑 OpenAI Realtime: response cancelled")
            #endif
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
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("📸 OpenAI Realtime: sent screenshot (\(jpegData.count / 1024)KB)")
            #endif
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
                    // MARK: - Skilly — Debug logging (stripped in release)
                    #if DEBUG
                    print("⚠️ OpenAI Realtime: WebSocket error: \(error)")
                    #endif

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
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("📩 OpenAI Realtime: session.created")
            #endif
            sessionCreatedContinuation?.resume()
            sessionCreatedContinuation = nil

        case "session.updated":
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("📩 OpenAI Realtime: session.updated")
            #endif

        case "response.audio.delta", "response.output_audio.delta":
            if let audioBase64 = json["delta"] as? String,
               let audioData = Data(base64Encoded: audioBase64) {
                if !isModelSpeaking {
                    // MARK: - Skilly — Debug logging (stripped in release)
                    #if DEBUG
                    print("🔊 OpenAI Realtime: first audio chunk received (\(audioData.count) bytes)")
                    #endif
                }
                isModelSpeaking = true
                eventPublisher.send(.audioChunk(audioData))
            }

        case "response.audio_transcript.delta", "response.output_audio_transcript.delta":
            if let delta = json["delta"] as? String {
                eventPublisher.send(.audioTranscriptDelta(delta))
            }

        case "conversation.item.input_audio_transcription.completed":
            if let transcript = json["transcript"] as? String {
                eventPublisher.send(.inputTranscriptDone(transcript))
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("🗣️ OpenAI Realtime STT: \"\(transcript.prefix(80))\"")
                #endif
            }

        case "response.output_item.done":
            // MARK: - Skilly — Tool call dispatch
            // When the model calls the point_at_element tool, the final item
            // arrives here with item.type == "function_call", item.name, and
            // item.arguments (JSON string). This fires BEFORE response.done.
            if let item = json["item"] as? [String: Any],
               let itemType = item["type"] as? String,
               itemType == "function_call",
               let name = item["name"] as? String,
               let argumentsJSON = item["arguments"] as? String,
               let callId = item["call_id"] as? String {
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("🛠️ OpenAI Realtime: function call '\(name)' \(argumentsJSON)")
                #endif
                eventPublisher.send(.functionCallDone(name: name, argumentsJSON: argumentsJSON, callId: callId))
            }

        case "response.done":
            isModelSpeaking = false
            let usage = RealtimeUsage.parse(from: json)
            eventPublisher.send(.responseDone(usage))
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🎯 OpenAI Realtime: response complete")
            #endif

        case "error":
            if let errorObj = json["error"] as? [String: Any],
               let errorMessage = errorObj["message"] as? String {
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ OpenAI Realtime error: \(errorMessage)")
                #endif
                eventPublisher.send(.error(errorMessage))
            }

        case "input_audio_buffer.speech_started":
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🎙️ OpenAI Realtime: speech detected")
            #endif

        case "input_audio_buffer.speech_stopped":
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🎙️ OpenAI Realtime: speech ended")
            #endif

        case "input_audio_buffer.committed":
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("📩 OpenAI Realtime: audio buffer committed")
            #endif

        default:
            // Log unknown events for debugging
            if !eventType.starts(with: "response.") && !eventType.starts(with: "rate_limits") {
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("📩 OpenAI Realtime: \(eventType)")
                #endif
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
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔌 OpenAI Realtime: WebSocket didOpen")
        #endif
        openBox.resume()
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "none"
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔴 OpenAI Realtime: WebSocket didClose (code: \(closeCode.rawValue), reason: \(reasonStr))")
        #endif
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ OpenAI Realtime: task error: \(error)")
            #endif
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
