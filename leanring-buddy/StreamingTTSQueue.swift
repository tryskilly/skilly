// MARK: - Skilly
//
//  StreamingTTSQueue.swift
//  leanring-buddy
//
//  Manages a queue of TTS audio segments for gapless sentence-level playback.
//  As Claude streams its response, each complete sentence is sent to ElevenLabs
//  independently. Audio segments are queued and played back-to-back so the user
//  hears continuous speech that starts playing after the FIRST sentence is ready,
//  rather than waiting for the entire response.
//

import AVFoundation
import Combine
import Foundation

@MainActor
final class StreamingTTSQueue: NSObject, AVAudioPlayerDelegate {

    private let ttsClient: ElevenLabsTTSClient
    private var audioQueue: [Data] = []
    private var currentPlayer: AVAudioPlayer?
    private var isPlayingQueue: Bool = false

    /// Called when the first audio segment starts playing — used by
    /// CompanionManager to transition from processing to responding state.
    var onFirstAudioStarted: (() -> Void)?

    /// Called when all queued audio has finished playing.
    var onAllAudioFinished: (() -> Void)?

    private var hasStartedPlaying = false
    private var isFinalSegmentQueued = false

    init(ttsClient: ElevenLabsTTSClient) {
        self.ttsClient = ttsClient
        super.init()
    }

    /// Queue a sentence for TTS synthesis and playback.
    /// The audio is fetched from ElevenLabs and added to the playback queue.
    /// If nothing is currently playing, playback starts immediately.
    func queueSentence(_ sentence: String) {
        let trimmed = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        Task {
            do {
                let audioData = try await fetchTTSAudio(text: trimmed)
                audioQueue.append(audioData)
                print("🔊 TTS queue: added segment (\(audioData.count / 1024)KB), queue size: \(audioQueue.count)")

                if !isPlayingQueue {
                    playNextInQueue()
                }
            } catch {
                print("⚠️ TTS queue: failed to synthesize sentence: \(error)")
            }
        }
    }

    /// Mark that the final segment has been queued. When the queue drains,
    /// onAllAudioFinished will be called.
    func markFinalSegmentQueued() {
        isFinalSegmentQueued = true
        // If queue is already empty and nothing playing, fire immediately
        if audioQueue.isEmpty && !isPlayingQueue {
            onAllAudioFinished?()
        }
    }

    /// Stop all playback and clear the queue.
    func stopAndClear() {
        currentPlayer?.stop()
        currentPlayer = nil
        audioQueue.removeAll()
        isPlayingQueue = false
        hasStartedPlaying = false
        isFinalSegmentQueued = false
    }

    // MARK: - Private

    private func playNextInQueue() {
        guard !audioQueue.isEmpty else {
            isPlayingQueue = false
            if isFinalSegmentQueued {
                onAllAudioFinished?()
            }
            return
        }

        isPlayingQueue = true
        let audioData = audioQueue.removeFirst()

        do {
            let player = try AVAudioPlayer(data: audioData)
            player.delegate = self
            currentPlayer = player
            player.play()

            if !hasStartedPlaying {
                hasStartedPlaying = true
                onFirstAudioStarted?()
            }
        } catch {
            print("⚠️ TTS queue: failed to play audio: \(error)")
            // Skip this segment and try the next one
            playNextInQueue()
        }
    }

    /// Fetch TTS audio from ElevenLabs via the Worker proxy.
    /// Returns raw audio data (MP3).
    private func fetchTTSAudio(text: String) async throws -> Data {
        let proxyURL = URL(string: "https://skilly-proxy.eng-mohamedszaied.workers.dev/tts")!
        var request = URLRequest(url: proxyURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("audio/mpeg", forHTTPHeaderField: "Accept")

        let body: [String: Any] = [
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "voice_settings": [
                "stability": 0.5,
                "similarity_boost": 0.75
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown"
            throw NSError(domain: "StreamingTTS", code: statusCode,
                          userInfo: [NSLocalizedDescriptionKey: "TTS error (\(statusCode)): \(errorBody)"])
        }

        return data
    }

    // MARK: - AVAudioPlayerDelegate

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            playNextInQueue()
        }
    }
}
