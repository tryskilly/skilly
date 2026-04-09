// MARK: - Skilly
//
//  GeminiLiveSessionManager.swift
//  leanring-buddy
//
//  High-level session manager for the Gemini Live API pipeline.
//  Replaces the classic STT → LLM → TTS pipeline with a single
//  WebSocket that handles audio input, vision, and audio output.
//
//  Usage:
//    1. Call startSession() on push-to-talk press
//    2. Feed audio via sendAudioBuffer() from AVAudioEngine tap
//    3. Send screenshot via sendScreenshot()
//    4. Call endUserTurn() on push-to-talk release
//    5. Audio response streams back via onAudioOutput
//    6. Call endSession() when done
//

import AVFoundation
import Combine
import Foundation

@MainActor
final class GeminiLiveSessionManager: ObservableObject {

    @Published private(set) var isSessionActive = false
    @Published private(set) var isModelResponding = false
    @Published private(set) var lastTranscriptFromModel: String = ""

    /// Called with PCM16 24kHz audio chunks as the model speaks.
    var onAudioOutput: ((Data) -> Void)?

    /// Called with the model's text response (transcript of what it's saying).
    var onTextOutput: ((String) -> Void)?

    /// Called when the model finishes its response turn.
    var onTurnComplete: (() -> Void)?

    /// Called when an error occurs.
    var onError: ((String) -> Void)?

    private let geminiLiveClient = GeminiLiveClient()
    private var audioPlayer: GeminiAudioPlayer?
    private var responseSubscription: AnyCancellable?
    private var fullResponseText = ""

    // MARK: - Session Lifecycle

    /// Start a Gemini Live session. Opens the WebSocket and configures
    /// the model with the system prompt and voice. The API key is fetched
    /// from the Worker proxy automatically (token relay pattern).
    func startSession(
        systemPrompt: String,
        voiceName: String = "Kore"
    ) async throws {
        guard !isSessionActive else { return }

        let sessionStartTime = CFAbsoluteTimeGetCurrent()

        // Subscribe to response events
        responseSubscription = geminiLiveClient.responseEventPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleResponseEvent(event)
            }

        // Connect to Gemini Live API
        try await geminiLiveClient.connect(
            systemPrompt: systemPrompt,
            voiceName: voiceName
        )

        // Initialize audio player for output
        audioPlayer = GeminiAudioPlayer()

        isSessionActive = true
        fullResponseText = ""

        let connectTime = CFAbsoluteTimeGetCurrent()
        print("⏱️ Gemini Live: session started in \(Int((connectTime - sessionStartTime) * 1000))ms")
    }

    /// End the current session and disconnect.
    func endSession() {
        responseSubscription?.cancel()
        responseSubscription = nil
        audioPlayer?.stop()
        audioPlayer = nil
        geminiLiveClient.disconnect()
        isSessionActive = false
        isModelResponding = false
        fullResponseText = ""
    }

    // MARK: - Send User Message

    /// Send a text transcript to the model. Gemini handles LLM + TTS.
    /// The native-audio model does not support inline images — for
    /// screenshot-based interactions, use the classic Claude pipeline.
    func sendTranscript(_ transcript: String) {
        guard isSessionActive else { return }
        geminiLiveClient.sendTextMessage(transcript)
        print("🎙️ Gemini Live: sent transcript, waiting for audio response")
    }

    // MARK: - Response Handling

    private func handleResponseEvent(_ event: GeminiLiveResponseEvent) {
        switch event {
        case .setupComplete:
            break  // Already handled in connect()

        case .audioChunk(let pcm16Data):
            isModelResponding = true
            audioPlayer?.enqueueAudio(pcm16Data)
            onAudioOutput?(pcm16Data)

        case .textChunk(let text):
            fullResponseText += text
            lastTranscriptFromModel = fullResponseText
            onTextOutput?(text)

        case .turnComplete:
            isModelResponding = false
            print("🎯 Gemini Live: model turn complete — \"\(fullResponseText.prefix(80))...\"")
            onTurnComplete?()
            fullResponseText = ""

        case .interrupted:
            isModelResponding = false
            audioPlayer?.stop()
            print("🎯 Gemini Live: model interrupted by user")

        case .error(let message):
            isModelResponding = false
            onError?(message)
            print("⚠️ Gemini Live: error — \(message)")
        }
    }

    // MARK: - Audio Conversion (reserved for future realtimeInput audio support)

    /// Convert an AVAudioPCMBuffer to raw PCM16 mono 16kHz data.
    /// Currently unused — the native-audio model only accepts text via clientContent.
    /// Kept for future use when Gemini Live supports audio+vision in one session.
    private func convertBufferToPCM16(_ buffer: AVAudioPCMBuffer) -> Data? {
        guard let floatData = buffer.floatChannelData else { return nil }

        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        let sourceSampleRate = buffer.format.sampleRate
        let targetSampleRate = 16000.0

        // Downsample ratio
        let ratio = sourceSampleRate / targetSampleRate
        let targetFrameCount = Int(Double(frameCount) / ratio)

        var pcm16Bytes = Data(capacity: targetFrameCount * 2)

        for targetFrame in 0..<targetFrameCount {
            let sourceFrame = Int(Double(targetFrame) * ratio)
            guard sourceFrame < frameCount else { break }

            // Mix channels to mono
            var sample: Float = 0
            for channel in 0..<channelCount {
                sample += floatData[channel][sourceFrame]
            }
            sample /= Float(channelCount)

            // Clamp and convert to Int16
            let clamped = max(-1.0, min(1.0, sample))
            var int16Value = Int16(clamped * Float(Int16.max))
            pcm16Bytes.append(Data(bytes: &int16Value, count: 2))
        }

        return pcm16Bytes
    }
}

// MARK: - Audio Player for Gemini 24kHz PCM Output

/// Plays back PCM16 mono 24kHz audio chunks from the Gemini Live API
/// using AVAudioEngine for gapless streaming playback.
final class GeminiAudioPlayer {
    private let audioEngine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let outputFormat: AVAudioFormat
    private var isStarted = false

    init() {
        // Gemini outputs PCM16 mono at 24kHz
        self.outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 24000,
            channels: 1,
            interleaved: false
        )!

        audioEngine.attach(playerNode)
        audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: outputFormat)
    }

    /// Enqueue a chunk of PCM16 mono 24kHz audio for playback.
    func enqueueAudio(_ pcm16Data: Data) {
        if !isStarted {
            do {
                try audioEngine.start()
                playerNode.play()
                isStarted = true
            } catch {
                print("⚠️ GeminiAudioPlayer: failed to start audio engine: \(error)")
                return
            }
        }

        // Convert PCM16 bytes to AVAudioPCMBuffer
        let frameCount = pcm16Data.count / 2  // 2 bytes per sample
        guard let buffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: AVAudioFrameCount(frameCount)) else {
            return
        }
        buffer.frameLength = AVAudioFrameCount(frameCount)

        guard let floatChannelData = buffer.floatChannelData else { return }

        pcm16Data.withUnsafeBytes { rawBuffer in
            guard let int16Pointer = rawBuffer.bindMemory(to: Int16.self).baseAddress else { return }
            for frame in 0..<frameCount {
                floatChannelData[0][frame] = Float(int16Pointer[frame]) / Float(Int16.max)
            }
        }

        playerNode.scheduleBuffer(buffer, completionHandler: nil)
    }

    /// Stop playback and reset.
    func stop() {
        playerNode.stop()
        if isStarted {
            audioEngine.stop()
            isStarted = false
        }
    }
}
