// MARK: - Skilly
//
//  RealtimeTelemetry.swift
//  leanring-buddy
//
//  JSONL telemetry logger for OpenAI Realtime API sessions.
//  Writes to ~/Library/Application Support/skilly-telemetry.jsonl
//
//  Per-turn rows: token counts, timing, speech durations, vision usage.
//  Session summary row: written on disconnect with totals.
//

import Combine
import Foundation
import PostHog

// MARK: - Telemetry Row Models

/// A single turn's telemetry data.
struct RealtimeTurnRow: Codable {
    let session_id: String
    let turn_index: Int
    let timestamp: String  // ISO8601

    // Model
    let model: String

    // Token counts from response.done usage
    let audio_input_tokens: Int?
    let audio_output_tokens: Int?
    let text_input_tokens: Int?
    let text_output_tokens: Int?
    let cached_input_tokens: Int?
    let total_tokens: Int?

    // Full usage object raw — in case OpenAI adds fields
    let usage_raw: [String: AnyCodable]?

    // Timing
    let turn_latency_ms: Int?
    let user_speech_duration_ms: Int?
    let assistant_speech_duration_ms: Int?

    // Vision
    let vision_used: Bool
    let vision_tokens: Int?

    enum CodingKeys: String, CodingKey {
        case session_id, turn_index, timestamp, model
        case audio_input_tokens, audio_output_tokens
        case text_input_tokens, text_output_tokens
        case cached_input_tokens, total_tokens
        case usage_raw
        case turn_latency_ms, user_speech_duration_ms, assistant_speech_duration_ms
        case vision_used, vision_tokens
    }
}

/// A session summary written on disconnect.
struct RealtimeSessionSummaryRow: Codable {
    let session_id: String
    let timestamp: String
    let model: String
    let session_duration_ms: Int

    // Turn totals
    let total_turns: Int
    let total_audio_input_tokens: Int
    let total_audio_output_tokens: Int
    let total_text_input_tokens: Int
    let total_text_output_tokens: Int
    let total_cached_input_tokens: Int
    let total_tokens: Int

    // Timing aggregates
    let total_user_speech_duration_ms: Int
    let total_assistant_speech_duration_ms: Int
    let avg_turn_latency_ms: Int
}

// MARK: - AnyCodable Helper

/// Encodes arbitrary JSON values for storage without strict schema.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) {
            value = intVal
        } else if let doubleVal = try? container.decode(Double.self) {
            value = doubleVal
        } else if let stringVal = try? container.decode(String.self) {
            value = stringVal
        } else if let boolVal = try? container.decode(Bool.self) {
            value = boolVal
        } else if let arrayVal = try? container.decode([AnyCodable].self) {
            value = arrayVal.map(\.value)
        } else if let dictVal = try? container.decode([String: AnyCodable].self) {
            value = dictVal.mapValues(\.value)
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let intVal as Int:
            try container.encode(intVal)
        case let doubleVal as Double:
            try container.encode(doubleVal)
        case let stringVal as String:
            try container.encode(stringVal)
        case let boolVal as Bool:
            try container.encode(boolVal)
        case let arrayVal as [Any]:
            try container.encode(arrayVal.map { AnyCodable($0) })
        case let dictVal as [String: Any]:
            try container.encode(dictVal.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}



// MARK: - Telemetry Logger

@MainActor
final class RealtimeTelemetry: ObservableObject {

    // MARK: - Singleton

    static let shared = RealtimeTelemetry()

    // MARK: - File

    private let fileManager = FileManager.default
    private var fileHandle: FileHandle?
    private let logFileName = "skilly-telemetry.jsonl"

    private var logFileURL: URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let skillyDir = appSupport.appendingPathComponent("skilly", isDirectory: true)
        return skillyDir.appendingPathComponent(logFileName)
    }

    // MARK: - Session State

    private(set) var sessionId: String?
    private var sessionStartTime: Date?
    private var model: String = "unknown"

    private var turnIndex: Int = 0
    private var turnStartTime: Date?
    private var userSpeechStartTime: Date?
    private var userSpeechEndTime: Date?
    private var assistantSpeechStartTime: Date?
    private var assistantSpeechEndTime: Date?
    private var visionUsed: Bool = false
    private var visionTokens: Int?

    // Accumulator for session summary
    private var totalAudioInputTokens: Int = 0
    private var totalAudioOutputTokens: Int = 0
    private var totalTextInputTokens: Int = 0
    private var totalTextOutputTokens: Int = 0
    private var totalCachedInputTokens: Int = 0
    private var totalTokens: Int = 0
    private var totalUserSpeechDurationMs: Int = 0
    private var totalAssistantSpeechDurationMs: Int = 0
    private var turnLatenciesMs: [Int] = []

    // MARK: - Init

    private init() {}

    // MARK: - Session Lifecycle

    func beginSession(model: String) {
        sessionId = UUID().uuidString
        sessionStartTime = Date()
        self.model = model

        // Reset accumulators
        turnIndex = 0
        totalAudioInputTokens = 0
        totalAudioOutputTokens = 0
        totalTextInputTokens = 0
        totalTextOutputTokens = 0
        totalCachedInputTokens = 0
        totalTokens = 0
        totalUserSpeechDurationMs = 0
        totalAssistantSpeechDurationMs = 0
        turnLatenciesMs = []

        openFile()
    }

    func endSession() {
        guard let sid = sessionId, let startTime = sessionStartTime else { return }

        let durationMs = Int(Date().timeIntervalSince(startTime) * 1000)
        let avgLatency = turnLatenciesMs.isEmpty ? 0 : turnLatenciesMs.reduce(0, +) / turnLatenciesMs.count

        let summary = RealtimeSessionSummaryRow(
            session_id: sid,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            model: model,
            session_duration_ms: durationMs,
            total_turns: turnIndex,
            total_audio_input_tokens: totalAudioInputTokens,
            total_audio_output_tokens: totalAudioOutputTokens,
            total_text_input_tokens: totalTextInputTokens,
            total_text_output_tokens: totalTextOutputTokens,
            total_cached_input_tokens: totalCachedInputTokens,
            total_tokens: totalTokens,
            total_user_speech_duration_ms: totalUserSpeechDurationMs,
            total_assistant_speech_duration_ms: totalAssistantSpeechDurationMs,
            avg_turn_latency_ms: avgLatency
        )

        appendRow(summary)

        let sessionCost = RealtimePricing.cost(
            audioInputTokens: totalAudioInputTokens,
            audioOutputTokens: totalAudioOutputTokens,
            textInputTokens: totalTextInputTokens,
            textOutputTokens: totalTextOutputTokens
        )
        SkillyAnalytics.trackSessionEnded(
            sessionId: sid,
            model: model,
            sessionDurationMs: durationMs,
            totalTurns: turnIndex,
            totalAudioInputTokens: totalAudioInputTokens,
            totalAudioOutputTokens: totalAudioOutputTokens,
            totalTextInputTokens: totalTextInputTokens,
            totalTextOutputTokens: totalTextOutputTokens,
            totalCachedInputTokens: totalCachedInputTokens,
            totalTokens: totalTokens,
            totalUserSpeechDurationMs: totalUserSpeechDurationMs,
            totalAssistantSpeechDurationMs: totalAssistantSpeechDurationMs,
            avgTurnLatencyMs: avgLatency,
            sessionCostUsd: sessionCost
        )

        closeFile()

        sessionId = nil
        sessionStartTime = nil
    }

    // MARK: - Turn Lifecycle

    /// Call when the user begins speaking (PTT pressed).
    func beginUserSpeech() {
        userSpeechStartTime = Date()
        userSpeechEndTime = nil
        assistantSpeechStartTime = nil
        assistantSpeechEndTime = nil
        visionUsed = false
        visionTokens = nil
    }

    /// Call when the user stops speaking (PTT released, audio committed).
    func endUserSpeech() {
        userSpeechEndTime = Date()
    }

    /// Call when the first audio byte arrives from the model.
    func beginAssistantSpeech() {
        assistantSpeechStartTime = Date()
    }

    /// Call when the assistant finishes speaking (audio queue drained).
    func endAssistantSpeech() {
        assistantSpeechEndTime = Date()
    }

    /// Call when a screenshot is sent into the Realtime session.
    func recordVisionUsed(tokens: Int? = nil) {
        visionUsed = true
        visionTokens = tokens
    }

    /// Call when the turn is complete (response.done received).
    func endTurn(usage: RealtimeUsage?) {
        guard let sessionId, let turnStart = turnStartTime else { return }

        let now = Date()
        let latencyMs: Int?
        if let assistantStart = assistantSpeechStartTime, let userEnd = userSpeechEndTime {
            latencyMs = Int(assistantStart.timeIntervalSince(userEnd) * 1000)
            turnLatenciesMs.append(latencyMs!)
        } else {
            latencyMs = nil
        }

        let userSpeechMs: Int?
        if let start = userSpeechStartTime, let end = userSpeechEndTime {
            userSpeechMs = Int(end.timeIntervalSince(start) * 1000)
            totalUserSpeechDurationMs += userSpeechMs!
        } else {
            userSpeechMs = nil
        }

        let assistantSpeechMs: Int?
        if let start = assistantSpeechStartTime, let end = assistantSpeechEndTime {
            assistantSpeechMs = Int(end.timeIntervalSince(start) * 1000)
            totalAssistantSpeechDurationMs += assistantSpeechMs!
        } else {
            assistantSpeechMs = nil
        }

        let row = RealtimeTurnRow(
            session_id: sessionId,
            turn_index: turnIndex,
            timestamp: ISO8601DateFormatter().string(from: now),
            model: model,
            audio_input_tokens: usage?.audio_input_tokens,
            audio_output_tokens: usage?.audio_output_tokens,
            text_input_tokens: usage?.text_input_tokens,
            text_output_tokens: usage?.text_output_tokens,
            cached_input_tokens: usage?.cached_input_tokens,
            total_tokens: usage?.total_tokens,
            usage_raw: usage.map { usageToDict($0) },
            turn_latency_ms: latencyMs,
            user_speech_duration_ms: userSpeechMs,
            assistant_speech_duration_ms: assistantSpeechMs,
            vision_used: visionUsed,
            vision_tokens: visionTokens
        )

        // Accumulate for summary
        if let u = usage {
            totalAudioInputTokens += u.audio_input_tokens ?? 0
            totalAudioOutputTokens += u.audio_output_tokens ?? 0
            totalTextInputTokens += u.text_input_tokens ?? 0
            totalTextOutputTokens += u.text_output_tokens ?? 0
            totalCachedInputTokens += u.cached_input_tokens ?? 0
            totalTokens += u.total_tokens ?? 0
        }

        appendRow(row)
        turnIndex += 1

        let turnCost = RealtimePricing.turnCost(
            audioInputTokens: usage?.audio_input_tokens,
            audioOutputTokens: usage?.audio_output_tokens,
            textInputTokens: usage?.text_input_tokens,
            textOutputTokens: usage?.text_output_tokens
        )
        SkillyAnalytics.trackTurnCompleted(
            sessionId: sessionId,
            turnIndex: turnIndex - 1,
            model: model,
            audioInputTokens: usage?.audio_input_tokens,
            audioOutputTokens: usage?.audio_output_tokens,
            textInputTokens: usage?.text_input_tokens,
            textOutputTokens: usage?.text_output_tokens,
            cachedInputTokens: usage?.cached_input_tokens,
            totalTokens: usage?.total_tokens,
            turnLatencyMs: latencyMs,
            userSpeechDurationMs: userSpeechMs,
            assistantSpeechDurationMs: assistantSpeechMs,
            visionUsed: visionUsed,
            visionTokens: visionTokens,
            turnCostUsd: turnCost
        )

        // Reset per-turn state
        turnStartTime = nil
        userSpeechStartTime = nil
        userSpeechEndTime = nil
        assistantSpeechStartTime = nil
        assistantSpeechEndTime = nil
        visionUsed = false
        visionTokens = nil
    }

    /// Call at the start of a new turn (before user speaks).
    func beginTurn() {
        turnStartTime = Date()
    }

    // MARK: - Private

    private func openFile() {
        do {
            let dir = logFileURL.deletingLastPathComponent()
            try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
            let handle = try FileHandle(forWritingTo: logFileURL)
            handle.seekToEndOfFile()
            fileHandle = handle
        } catch {
            print("📊 Telemetry: failed to open log file: \(error)")
        }
    }

    private func appendRow<T: Encodable>(_ row: T) {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            let data = try encoder.encode(row)
            guard var line = String(data: data, encoding: .utf8) else { return }
            line += "\n"
            if let lineData = line.data(using: .utf8) {
                fileHandle?.write(lineData)
            }
        } catch {
            print("📊 Telemetry: failed to encode row: \(error)")
        }
    }

    private func closeFile() {
        try? fileHandle?.close()
        fileHandle = nil
    }

    private func usageToDict(_ usage: RealtimeUsage) -> [String: AnyCodable] {
        var dict: [String: AnyCodable] = [:]
        if let v = usage.input_tokens { dict["input_tokens"] = AnyCodable(v) }
        if let v = usage.output_tokens { dict["output_tokens"] = AnyCodable(v) }
        if let v = usage.total_tokens { dict["total_tokens"] = AnyCodable(v) }
        if let details = usage.input_token_details {
            var inner: [String: AnyCodable] = [:]
            if let v = details.cached_tokens { inner["cached_tokens"] = AnyCodable(v) }
            if let v = details.audio_tokens { inner["audio_tokens"] = AnyCodable(v) }
            if !inner.isEmpty { dict["input_token_details"] = AnyCodable(inner) }
        }
        if let details = usage.output_token_details {
            var inner: [String: AnyCodable] = [:]
            if let v = details.audio_tokens { inner["audio_tokens"] = AnyCodable(v) }
            if let v = details.reasoning_tokens { inner["reasoning_tokens"] = AnyCodable(v) }
            if !inner.isEmpty { dict["output_token_details"] = AnyCodable(inner) }
        }
        return dict
    }
}

