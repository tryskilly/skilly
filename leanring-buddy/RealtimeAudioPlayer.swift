// MARK: - Skilly
//
//  RealtimeAudioPlayer.swift
//  leanring-buddy
//
//  Plays back PCM16 mono 24kHz audio chunks from the OpenAI Realtime API
//  using AVAudioEngine for gapless streaming playback.
//

import AVFoundation
import Foundation

final class RealtimeAudioPlayer {
    private let audioEngine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let outputFormat: AVAudioFormat
    private var isStarted = false
    private let queuedBufferCountLock = NSLock()
    private var queuedBufferCount: Int = 0

    /// Called on the main thread when the scheduled audio queue drains fully.
    var onQueueDrained: (() -> Void)?

    var hasPendingAudio: Bool {
        queuedBufferCountLock.lock()
        defer { queuedBufferCountLock.unlock() }
        return queuedBufferCount > 0
    }

    init() {
        // OpenAI Realtime outputs PCM16 mono at 24kHz
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
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ RealtimeAudioPlayer: failed to start audio engine: \(error)")
                #endif
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

        incrementQueuedBufferCount()
        playerNode.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            self?.decrementQueuedBufferCountAndNotifyIfNeeded()
        }
    }

    /// Stop playback and reset.
    func stop() {
        queuedBufferCountLock.lock()
        queuedBufferCount = 0
        queuedBufferCountLock.unlock()

        playerNode.stop()
        if isStarted {
            audioEngine.stop()
            isStarted = false
        }
    }

    private func incrementQueuedBufferCount() {
        queuedBufferCountLock.lock()
        queuedBufferCount += 1
        queuedBufferCountLock.unlock()
    }

    private func decrementQueuedBufferCountAndNotifyIfNeeded() {
        var shouldNotifyQueueDrained = false
        queuedBufferCountLock.lock()
        if queuedBufferCount > 0 {
            queuedBufferCount -= 1
            shouldNotifyQueueDrained = queuedBufferCount == 0
        }
        queuedBufferCountLock.unlock()

        guard shouldNotifyQueueDrained else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onQueueDrained?()
        }
    }
}
