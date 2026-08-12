import Foundation
import Testing
@testable import Skilly

@Suite("OpenAIRealtimeClient typed prompts")
@MainActor
struct OpenAIRealtimeClientTypedPromptTests {
    @Test("Classifies the fixed 60-minute session expiry as lifecycle, not failure")
    func classifiesExpectedSessionExpiry() {
        #expect(OpenAIRealtimeClient.disposition(forServerErrorCode: "session_expired") == .sessionExpired)
        #expect(OpenAIRealtimeClient.disposition(forServerErrorCode: "response_cancel_not_active") == .benignNoOp)
        #expect(OpenAIRealtimeClient.disposition(forServerErrorCode: "insufficient_quota") == .failure)
    }

    @Test("Sends bounded screen items before the typed question and audio response")
    func createsOrderedMultimodalContent() throws {
        let screenshots = [
            RealtimeScreenshotInput(jpegData: Data([1, 2]), description: "primary screen"),
            RealtimeScreenshotInput(jpegData: Data([3, 4]), description: "second screen"),
        ]

        let typedPromptEvents = TypedPromptRealtimePayload.makeEvents(
            text: "Where is the bevel control?",
            screenshots: screenshots
        )
        #expect(typedPromptEvents.conversationItems.count == 3)

        let firstScreenItem = try #require(typedPromptEvents.conversationItems[0]["item"] as? [String: Any])
        let firstScreenContent = try #require(firstScreenItem["content"] as? [[String: Any]])
        #expect(firstScreenContent.count == 2)
        #expect(firstScreenContent[0]["text"] as? String == "primary screen")
        #expect(firstScreenContent[1]["type"] as? String == "input_image")

        let secondScreenItem = try #require(typedPromptEvents.conversationItems[1]["item"] as? [String: Any])
        let secondScreenContent = try #require(secondScreenItem["content"] as? [[String: Any]])
        #expect(secondScreenContent[0]["text"] as? String == "second screen")

        let questionItem = try #require(typedPromptEvents.conversationItems[2]["item"] as? [String: Any])
        let questionContent = try #require(questionItem["content"] as? [[String: Any]])
        #expect(questionContent.count == 1)
        #expect(questionContent[0]["text"] as? String == "Where is the bevel control?")

        let responseRequest = try #require(typedPromptEvents.responseRequest["response"] as? [String: Any])
        #expect(responseRequest["output_modalities"] as? [String] == ["audio"])
    }
}
