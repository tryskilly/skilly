import Foundation
import Testing
@testable import Skilly

@Suite("ConversationHistoryStore")
@MainActor
struct ConversationHistoryStoreTests {
    @Test("Persists text and replay audio without losing input mode")
    func persistsConversationTurnAndAudio() throws {
        let temporaryDirectoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectoryURL) }

        let originalStore = ConversationHistoryStore(baseDirectoryURL: temporaryDirectoryURL)
        let expectedAudioData = Data([1, 2, 3, 4])
        let recordedTurn = try #require(originalStore.recordCompletedTurn(
            userMessage: "Where is the bevel tool?",
            assistantMessage: "It is in the modifier panel.",
            inputMode: .text,
            assistantPCM16Audio: expectedAudioData
        ))

        let reloadedStore = ConversationHistoryStore(baseDirectoryURL: temporaryDirectoryURL)
        let reloadedTurn = try #require(reloadedStore.turns.first)

        #expect(reloadedTurn.id == recordedTurn.id)
        #expect(reloadedTurn.inputMode == .text)
        #expect(reloadedTurn.userMessage == "Where is the bevel tool?")
        #expect(reloadedStore.audioData(for: reloadedTurn) == expectedAudioData)
    }

    @Test("Retention removes the oldest turn and its audio")
    func enforcesRetentionLimit() throws {
        let temporaryDirectoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectoryURL) }

        let conversationHistoryStore = ConversationHistoryStore(
            baseDirectoryURL: temporaryDirectoryURL,
            maximumStoredTurns: 2
        )
        let firstTurn = try #require(conversationHistoryStore.recordCompletedTurn(
            userMessage: "First",
            assistantMessage: "First answer",
            inputMode: .voice,
            assistantPCM16Audio: Data([1])
        ))
        _ = conversationHistoryStore.recordCompletedTurn(
            userMessage: "Second",
            assistantMessage: "Second answer",
            inputMode: .voice,
            assistantPCM16Audio: Data([2])
        )
        _ = conversationHistoryStore.recordCompletedTurn(
            userMessage: "Third",
            assistantMessage: "Third answer",
            inputMode: .text,
            assistantPCM16Audio: Data([3])
        )

        #expect(conversationHistoryStore.turns.map(\.userMessage) == ["Second", "Third"])
        #expect(conversationHistoryStore.audioData(for: firstTurn) == nil)
    }

    @Test("Clear removes messages and saved audio")
    func clearsHistoryAndAudio() throws {
        let temporaryDirectoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectoryURL) }

        let conversationHistoryStore = ConversationHistoryStore(baseDirectoryURL: temporaryDirectoryURL)
        let recordedTurn = try #require(conversationHistoryStore.recordCompletedTurn(
            userMessage: "Question",
            assistantMessage: "Answer",
            inputMode: .voice,
            assistantPCM16Audio: Data([9, 8, 7])
        ))

        conversationHistoryStore.clearHistory()

        #expect(conversationHistoryStore.turns.isEmpty)
        #expect(conversationHistoryStore.audioData(for: recordedTurn) == nil)
        let reloadedStore = ConversationHistoryStore(baseDirectoryURL: temporaryDirectoryURL)
        #expect(reloadedStore.turns.isEmpty)
    }

    @Test("Authenticated accounts cannot see each other's local history")
    func isolatesHistoryByAuthenticatedUser() throws {
        let temporaryApplicationSupportURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: temporaryApplicationSupportURL) }

        let conversationHistoryStore = ConversationHistoryStoreForAccountIsolationTests.makeStore(
            applicationSupportDirectoryURL: temporaryApplicationSupportURL
        )
        conversationHistoryStore.activateUser("user_first")
        _ = conversationHistoryStore.recordCompletedTurn(
            userMessage: "First user's question",
            assistantMessage: "First user's answer",
            inputMode: .voice,
            assistantPCM16Audio: Data()
        )

        conversationHistoryStore.activateUser("user_second")
        #expect(conversationHistoryStore.turns.isEmpty)
        _ = conversationHistoryStore.recordCompletedTurn(
            userMessage: "Second user's question",
            assistantMessage: "Second user's answer",
            inputMode: .text,
            assistantPCM16Audio: Data()
        )

        conversationHistoryStore.activateUser("user_first")
        #expect(conversationHistoryStore.turns.map(\.userMessage) == ["First user's question"])
        conversationHistoryStore.activateUser(nil)
        #expect(conversationHistoryStore.turns.isEmpty)
    }
}

private enum ConversationHistoryStoreForAccountIsolationTests {
    static func makeStore(applicationSupportDirectoryURL: URL) -> ConversationHistoryStore {
        ConversationHistoryStore(
            rootDirectoryURLForAuthenticatedUsers: applicationSupportDirectoryURL
        )
    }
}
