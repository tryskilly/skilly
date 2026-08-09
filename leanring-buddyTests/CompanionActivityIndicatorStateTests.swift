import XCTest
@testable import leanring_buddy

final class CompanionActivityIndicatorStateTests: XCTestCase {
    func testIdlePushToTalkHasNoIndicator() {
        XCTAssertNil(
            CompanionActivityIndicatorState.resolve(
                voiceState: .idle,
                isLiveTutorModeActive: false
            )
        )
    }

    func testPushToTalkListeningDisclosesOneScreenCapture() {
        let state = CompanionActivityIndicatorState.resolve(
            voiceState: .listening,
            isLiveTutorModeActive: false
        )

        XCTAssertEqual(state, .pushToTalkCapture)
        XCTAssertEqual(state?.detail, "Mic on · Screen context captured once")
        XCTAssertEqual(state?.analyticsMode, "push_to_talk")
        XCTAssertEqual(state?.isCapturing, true)
    }

    func testLiveTutorTakesPriorityAcrossVoiceStates() {
        for voiceState in [
            CompanionVoiceState.idle,
            .listening,
            .processing,
            .responding
        ] {
            XCTAssertEqual(
                CompanionActivityIndicatorState.resolve(
                    voiceState: voiceState,
                    isLiveTutorModeActive: true
                ),
                .liveTutorCapture
            )
        }
    }

    func testProcessingAndRespondingSayMicrophoneIsOff() {
        let processing = CompanionActivityIndicatorState.resolve(
            voiceState: .processing,
            isLiveTutorModeActive: false
        )
        let responding = CompanionActivityIndicatorState.resolve(
            voiceState: .responding,
            isLiveTutorModeActive: false
        )

        XCTAssertEqual(processing, .processing)
        XCTAssertEqual(responding, .responding)
        XCTAssertEqual(processing?.isCapturing, false)
        XCTAssertEqual(responding?.isCapturing, false)
        XCTAssertTrue(processing?.detail.contains("Microphone off") == true)
        XCTAssertTrue(responding?.detail.contains("Microphone off") == true)
    }
}
