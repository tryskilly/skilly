import Foundation

// This sample assumes the generated UniFFI Swift files from sdk/ios/generated
// are included in your target.
func runPolicyAndRealtimeDemo() {
    let policyInput = MobilePolicyInput(
        userId: "ios-user-123",
        entitlementState: .trial,
        trialSecondsUsed: 400,
        usageSecondsUsed: 0,
        adminWorkosUserIds: []
    )

    let policyDecision = canStartTurnForMobile(input: policyInput)
    print("Allowed: \(policyDecision.allowed), reason: \(String(describing: policyDecision.reason))")

    let events = [
        MobileRealtimeEvent(eventType: .turnStarted, turnId: "turn-ios-1", message: nil),
        MobileRealtimeEvent(eventType: .audioCaptureCommitted, turnId: "turn-ios-1", message: nil),
        MobileRealtimeEvent(eventType: .responseStarted, turnId: "turn-ios-1", message: nil),
        MobileRealtimeEvent(eventType: .responseCompleted, turnId: "turn-ios-1", message: nil),
    ]

    if let summary = replayRealtimeEventsForMobile(events: events) {
        print("Phase: \(summary.phaseName), turns completed: \(summary.turnsCompleted)")
    } else {
        print("Replay failed.")
    }
}
