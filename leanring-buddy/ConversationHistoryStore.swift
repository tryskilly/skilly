// MARK: - Skilly
//
//  ConversationHistoryStore.swift
//  leanring-buddy
//
//  Persists completed Skilly turns locally, including optional PCM audio for
//  replay. Transcript contents never leave this store through telemetry.

import Combine
import Foundation
import OSLog

enum ConversationInputMode: String, Codable, Equatable {
    case voice
    case text
}

struct ConversationTurn: Codable, Equatable, Identifiable {
    let id: UUID
    let userMessage: String
    let assistantMessage: String
    let inputMode: ConversationInputMode
    let createdAt: Date
    let assistantAudioFilename: String?

    var hasReplayableAudio: Bool {
        assistantAudioFilename != nil
    }
}

@MainActor
final class ConversationHistoryStore: ObservableObject {
    static let shared = ConversationHistoryStore()

    @Published private(set) var turns: [ConversationTurn] = []

    private let fileManager: FileManager
    private let rootDirectoryURL: URL
    private let usesFixedBaseDirectory: Bool
    private var activeUserID: String?
    private var historyFileURL: URL
    private var audioDirectoryURL: URL
    private let maximumStoredTurns: Int
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "app.tryskilly.skilly",
        category: "ConversationHistory"
    )

    init(
        baseDirectoryURL: URL? = nil,
        rootDirectoryURLForAuthenticatedUsers: URL? = nil,
        maximumStoredTurns: Int = 100,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.maximumStoredTurns = max(1, maximumStoredTurns)

        let resolvedBaseDirectoryURL: URL
        if let baseDirectoryURL {
            resolvedBaseDirectoryURL = baseDirectoryURL
            usesFixedBaseDirectory = true
        } else if let rootDirectoryURLForAuthenticatedUsers {
            resolvedBaseDirectoryURL = rootDirectoryURLForAuthenticatedUsers
            usesFixedBaseDirectory = false
        } else {
            let applicationSupportDirectoryURL = fileManager.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first!
            resolvedBaseDirectoryURL = applicationSupportDirectoryURL
                .appendingPathComponent("skilly", isDirectory: true)
                .appendingPathComponent("conversation-history", isDirectory: true)
            usesFixedBaseDirectory = false
        }

        rootDirectoryURL = resolvedBaseDirectoryURL
        historyFileURL = resolvedBaseDirectoryURL.appendingPathComponent("turns.json")
        audioDirectoryURL = resolvedBaseDirectoryURL.appendingPathComponent("audio", isDirectory: true)
        turns = usesFixedBaseDirectory
            ? Self.loadTurns(from: historyFileURL, fileManager: fileManager)
            : []
    }

    /// Swaps the visible history when authentication changes so one WorkOS
    /// account can never read or replay another account's local conversation.
    func activateUser(_ userID: String?) {
        guard !usesFixedBaseDirectory, activeUserID != userID else { return }
        activeUserID = userID

        guard let userID else {
            turns = []
            return
        }

        let safeUserDirectoryName = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? UUID().uuidString
        let userDirectoryURL = rootDirectoryURL
            .appendingPathComponent("users", isDirectory: true)
            .appendingPathComponent(safeUserDirectoryName, isDirectory: true)
        historyFileURL = userDirectoryURL.appendingPathComponent("turns.json")
        audioDirectoryURL = userDirectoryURL.appendingPathComponent("audio", isDirectory: true)
        turns = Self.loadTurns(from: historyFileURL, fileManager: fileManager)
    }

    @discardableResult
    func recordCompletedTurn(
        userMessage: String,
        assistantMessage: String,
        inputMode: ConversationInputMode,
        assistantPCM16Audio: Data
    ) -> ConversationTurn? {
        guard usesFixedBaseDirectory || activeUserID != nil else { return nil }
        let cleanedUserMessage = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedAssistantMessage = assistantMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedUserMessage.isEmpty, !cleanedAssistantMessage.isEmpty else { return nil }

        let turnID = UUID()
        let assistantAudioFilename = saveAudioIfPresent(assistantPCM16Audio, turnID: turnID)
        let conversationTurn = ConversationTurn(
            id: turnID,
            userMessage: cleanedUserMessage,
            assistantMessage: cleanedAssistantMessage,
            inputMode: inputMode,
            createdAt: Date(),
            assistantAudioFilename: assistantAudioFilename
        )

        turns.append(conversationTurn)
        removeTurnsBeyondRetentionLimit()
        saveTurns()
        logger.info("Recorded completed turn. total_turns=\(self.turns.count, privacy: .public) mode=\(inputMode.rawValue, privacy: .public) has_audio=\(assistantAudioFilename != nil, privacy: .public)")
        return conversationTurn
    }

    func audioData(for conversationTurn: ConversationTurn) -> Data? {
        guard let assistantAudioFilename = conversationTurn.assistantAudioFilename else { return nil }
        let audioFileURL = audioDirectoryURL.appendingPathComponent(assistantAudioFilename)
        return try? Data(contentsOf: audioFileURL)
    }

    func clearHistory() {
        for conversationTurn in turns {
            removeAudioFile(for: conversationTurn)
        }
        turns = []
        try? fileManager.removeItem(at: historyFileURL)
        try? fileManager.removeItem(at: audioDirectoryURL)
        try? fileManager.removeItem(at: historyFileURL.deletingLastPathComponent())
        logger.info("Cleared conversation history")
    }

    private static func loadTurns(from historyFileURL: URL, fileManager: FileManager) -> [ConversationTurn] {
        guard fileManager.fileExists(atPath: historyFileURL.path),
              let storedData = try? Data(contentsOf: historyFileURL) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([ConversationTurn].self, from: storedData)) ?? []
    }

    private func saveAudioIfPresent(_ assistantPCM16Audio: Data, turnID: UUID) -> String? {
        guard !assistantPCM16Audio.isEmpty else { return nil }
        let assistantAudioFilename = "\(turnID.uuidString).pcm"
        let assistantAudioFileURL = audioDirectoryURL.appendingPathComponent(assistantAudioFilename)

        do {
            try fileManager.createDirectory(
                at: audioDirectoryURL,
                withIntermediateDirectories: true
            )
            try assistantPCM16Audio.write(to: assistantAudioFileURL, options: .atomic)
            return assistantAudioFilename
        } catch {
            logger.error("Unable to persist conversation audio")
            return nil
        }
    }

    private func removeTurnsBeyondRetentionLimit() {
        guard turns.count > maximumStoredTurns else { return }
        let numberOfTurnsToRemove = turns.count - maximumStoredTurns
        let removedTurns = turns.prefix(numberOfTurnsToRemove)
        for conversationTurn in removedTurns {
            removeAudioFile(for: conversationTurn)
        }
        turns.removeFirst(numberOfTurnsToRemove)
    }

    private func removeAudioFile(for conversationTurn: ConversationTurn) {
        guard let assistantAudioFilename = conversationTurn.assistantAudioFilename else { return }
        let assistantAudioFileURL = audioDirectoryURL.appendingPathComponent(assistantAudioFilename)
        try? fileManager.removeItem(at: assistantAudioFileURL)
    }

    private func saveTurns() {
        do {
            try fileManager.createDirectory(
                at: historyFileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let encodedTurns = try encoder.encode(turns)
            try encodedTurns.write(to: historyFileURL, options: .atomic)
        } catch {
            logger.error("Unable to persist conversation history")
        }
    }
}
