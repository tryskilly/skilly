package app.tryskilly.sdk

// This sample assumes the generated UniFFI Kotlin files from sdk/android/generated
// are added to your Android module source set.
import uniffi.skilly_core_mobile_sdk.*

object PolicyAndRealtimeExample {
    fun runDemo() {
        val policyInput = MobilePolicyInput(
            userId = "android-user-123",
            entitlementState = MobileEntitlementState.TRIAL,
            trialSecondsUsed = 400UL,
            usageSecondsUsed = 0UL,
            adminWorkosUserIds = emptyList()
        )

        val policyDecision = canStartTurnForMobile(policyInput)
        println("Allowed=${policyDecision.allowed}, reason=${policyDecision.reason}")

        val events = listOf(
            MobileRealtimeEvent(MobileRealtimeEventType.TURN_STARTED, "turn-android-1", null),
            MobileRealtimeEvent(MobileRealtimeEventType.AUDIO_CAPTURE_COMMITTED, "turn-android-1", null),
            MobileRealtimeEvent(MobileRealtimeEventType.RESPONSE_STARTED, "turn-android-1", null),
            MobileRealtimeEvent(MobileRealtimeEventType.RESPONSE_COMPLETED, "turn-android-1", null)
        )

        val summary = replayRealtimeEventsForMobile(events)
        if (summary != null) {
            println("Phase=${summary.phaseName}, turnsCompleted=${summary.turnsCompleted}")
        } else {
            println("Replay failed")
        }
    }
}
