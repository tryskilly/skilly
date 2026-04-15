//
//  SkillyAnalytics.swift
//  leanring-buddy
//
//  Centralized PostHog analytics wrapper. All event names and properties
//  are defined here so instrumentation is consistent and easy to audit.
//

import Foundation
import PostHog

enum SkillyAnalytics {

    // MARK: - Setup

    // MARK: - Skilly — Setup uses AppSettings for configurable key and analytics toggle.
    static func configure() {
        let settings = AppSettings.shared
        guard !settings.postHogAPIKey.isEmpty, settings.analyticsEnabled else { return }
        let config = PostHogConfig(
            apiKey: settings.postHogAPIKey,
            host: "https://us.i.posthog.com"
        )
        config.captureApplicationLifecycleEvents = false
        PostHogSDK.shared.setup(config)
    }

    // MARK: - User Identity

    // MARK: - Skilly — Called once per authenticated session: after a successful
    // sign-in, and again on app launch when a stored session is restored. The
    // distinct_id is the WorkOS user ID, which is the same identifier the backend
    // and Worker use to key entitlements, so web and app events merge in PostHog.
    static func identify(user: SkillyUser, extraProperties: [String: Any] = [:]) {
        guard AppSettings.shared.analyticsEnabled else { return }
        var userProperties: [String: Any] = [
            "email": user.email
        ]
        let nameParts = [user.firstName, user.lastName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        if !nameParts.isEmpty {
            userProperties["name"] = nameParts.joined(separator: " ")
        }
        for (key, value) in extraProperties {
            userProperties[key] = value
        }
        PostHogSDK.shared.identify(user.id, userProperties: userProperties)
    }

    // MARK: - Skilly — Called on sign-out to clear the locally cached distinct_id
    // so the next user doesn't inherit the previous identity.
    static func reset() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.reset()
    }

    // MARK: - App Lifecycle

    /// Fired once on every app launch in applicationDidFinishLaunching.
    static func trackAppOpened() {
        guard AppSettings.shared.analyticsEnabled else { return }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        PostHogSDK.shared.capture("app_opened", properties: [
            "app_version": version
        ])
    }

    // MARK: - Onboarding

    /// User clicked the Start button to begin onboarding for the first time.
    static func trackOnboardingStarted() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("onboarding_started")
    }

    static func trackOnboardingReplayed() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("onboarding_replayed")
    }

    static func trackOnboardingVideoCompleted() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("onboarding_video_completed")
    }

    static func trackOnboardingDemoTriggered() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("onboarding_demo_triggered")
    }

    static func trackAllPermissionsGranted() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("all_permissions_granted")
    }

    static func trackPermissionGranted(permission: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("permission_granted", properties: [
            "permission": permission
        ])
    }

    static func trackPushToTalkStarted() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("push_to_talk_started")
    }

    static func trackPushToTalkReleased() {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("push_to_talk_released")
    }

    // MARK: - Skilly — Privacy: transcript text is never sent to analytics, only character count.
    static func trackUserMessageSent(transcript: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("user_message_sent", properties: [
            "character_count": transcript.count
        ])
    }

    // MARK: - Skilly — Privacy: response text is never sent to analytics, only character count.
    static func trackAIResponseReceived(response: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("ai_response_received", properties: [
            "character_count": response.count
        ])
    }

    static func trackElementPointed(elementLabel: String?) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("element_pointed", properties: [
            "element_label": elementLabel ?? "unknown"
        ])
    }

    static func trackResponseError(error: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("response_error", properties: [
            "error": error
        ])
    }

    static func trackTTSError(error: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("tts_error", properties: [
            "error": error
        ])
    }

    // MARK: - Skilly Telemetry (beta)

    static func trackTurnCompleted(
        sessionId: String,
        turnIndex: Int,
        model: String,
        audioInputTokens: Int?,
        audioOutputTokens: Int?,
        textInputTokens: Int?,
        textOutputTokens: Int?,
        cachedInputTokens: Int?,
        totalTokens: Int?,
        turnLatencyMs: Int?,
        userSpeechDurationMs: Int?,
        assistantSpeechDurationMs: Int?,
        visionUsed: Bool,
        visionTokens: Int?,
        turnCostUsd: Double
    ) {
        guard AppSettings.shared.analyticsEnabled,
              AppSettings.shared.beta_terms_consent else { return }
        PostHogSDK.shared.capture("skilly_turn_completed", properties: [
            "session_id": sessionId,
            "turn_index": turnIndex,
            "model": model,
            "audio_input_tokens": audioInputTokens as Any,
            "audio_output_tokens": audioOutputTokens as Any,
            "text_input_tokens": textInputTokens as Any,
            "text_output_tokens": textOutputTokens as Any,
            "cached_input_tokens": cachedInputTokens as Any,
            "total_tokens": totalTokens as Any,
            "turn_latency_ms": turnLatencyMs as Any,
            "user_speech_duration_ms": userSpeechDurationMs as Any,
            "assistant_speech_duration_ms": assistantSpeechDurationMs as Any,
            "vision_used": visionUsed,
            "vision_tokens": visionTokens as Any,
            "turn_cost_usd": turnCostUsd,
        ])
    }

    static func trackSessionEnded(
        sessionId: String,
        model: String,
        sessionDurationMs: Int,
        totalTurns: Int,
        totalAudioInputTokens: Int,
        totalAudioOutputTokens: Int,
        totalTextInputTokens: Int,
        totalTextOutputTokens: Int,
        totalCachedInputTokens: Int,
        totalTokens: Int,
        totalUserSpeechDurationMs: Int,
        totalAssistantSpeechDurationMs: Int,
        avgTurnLatencyMs: Int,
        sessionCostUsd: Double
    ) {
        guard AppSettings.shared.analyticsEnabled,
              AppSettings.shared.beta_terms_consent else { return }
        PostHogSDK.shared.capture("skilly_session_ended", properties: [
            "session_id": sessionId,
            "model": model,
            "session_duration_ms": sessionDurationMs,
            "total_turns": totalTurns,
            "total_audio_input_tokens": totalAudioInputTokens,
            "total_audio_output_tokens": totalAudioOutputTokens,
            "total_text_input_tokens": totalTextInputTokens,
            "total_text_output_tokens": totalTextOutputTokens,
            "total_cached_input_tokens": totalCachedInputTokens,
            "total_tokens": totalTokens,
            "total_user_speech_duration_ms": totalUserSpeechDurationMs,
            "total_assistant_speech_duration_ms": totalAssistantSpeechDurationMs,
            "avg_turn_latency_ms": avgTurnLatencyMs,
            "session_cost_usd": sessionCostUsd,
        ])
    }

    static func trackCheckoutStarted(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_checkout_started", properties: [
            "user_id": userId
        ])
    }

    static func trackSubscriptionActivated(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_subscription_activated", properties: [
            "user_id": userId
        ])
    }

    static func trackSubscriptionCanceled(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_subscription_canceled", properties: [
            "user_id": userId
        ])
    }

    static func trackPaywallShown(userId: String, reason: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_paywall_shown", properties: [
            "user_id": userId,
            "reason": reason
        ])
    }
}
