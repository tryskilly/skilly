import Combine
import Foundation
import PostHog

/// Tracks the 15-minute lifetime free trial per WorkOS user.
/// Keys are suffixed with the WorkOS user ID from AuthManager.shared.currentUser?.id.
/// One-shot: once exhausted, stays exhausted — never resets.
@MainActor
final class TrialTracker: ObservableObject {
    static let shared = TrialTracker()

    /// 15 minutes in seconds
    static let maxTrialSeconds: TimeInterval = 900

    /// 80% warning threshold (12 minutes)
    static let warningThresholdSeconds: TimeInterval = 720

    private let userDefaults = UserDefaults.standard

    private var userId: String? { AuthManager.shared.currentUser?.id }

    // MARK: - Keys
    private func key(_ suffix: String) -> String {
        guard let id = userId else { return suffix }
        return "trial_\(suffix)_\(id)"
    }

    // MARK: - State

    /// Total seconds consumed across all sessions (lifetime).
    var totalSecondsUsed: TimeInterval {
        get { userDefaults.double(forKey: key("seconds_used")) }
        set { userDefaults.set(newValue, forKey: key("seconds_used")) }
    }

    var remainingSeconds: TimeInterval {
        max(0, Self.maxTrialSeconds - totalSecondsUsed)
    }

    var isExhausted: Bool {
        // MARK: - Skilly — Admin bypass: allowlisted users never run out of trial time.
        if AdminAllowlist.isCurrentUserAdmin { return false }
        return totalSecondsUsed >= Self.maxTrialSeconds
    }

    var hasStarted: Bool {
        userDefaults.bool(forKey: key("started"))
    }

    var usageProgress: Double {
        min(1.0, totalSecondsUsed / Self.maxTrialSeconds)
    }

    /// Whether the 80% warning has already been sent.
    var hasSent80PercentWarning: Bool {
        get { userDefaults.bool(forKey: key("warned_80")) }
        set { userDefaults.set(newValue, forKey: key("warned_80")) }
    }

    // MARK: - Trial Milestone Flags (for PostHog deduplication)

    private var hasRecordedTrialStarted: Bool {
        get { userDefaults.bool(forKey: key("milestone_started")) }
        set { userDefaults.set(newValue, forKey: key("milestone_started")) }
    }

    private var hasRecordedFirstTurn: Bool {
        get { userDefaults.bool(forKey: key("milestone_first_turn")) }
        set { userDefaults.set(newValue, forKey: key("milestone_first_turn")) }
    }

    private var hasRecordedMinute5: Bool {
        get { userDefaults.bool(forKey: key("milestone_minute_5")) }
        set { userDefaults.set(newValue, forKey: key("milestone_minute_5")) }
    }

    private var hasRecordedMinute10: Bool {
        get { userDefaults.bool(forKey: key("milestone_minute_10")) }
        set { userDefaults.set(newValue, forKey: key("milestone_minute_10")) }
    }

    private var hasConvertedToPaid: Bool {
        get { userDefaults.bool(forKey: key("converted_to_paid")) }
        set { userDefaults.set(newValue, forKey: key("converted_to_paid")) }
    }

    // MARK: - Recording

    /// Call at the start of the first session to record trial_started.
    func beginTrialIfNeeded() {
        guard !AdminAllowlist.isCurrentUserAdmin else { return }
        guard let userId, hasStarted == false else { return }
        userDefaults.set(true, forKey: key("started"))
        hasRecordedTrialStarted = true
        SkillyAnalytics.trackTrialStarted(userId: userId)
    }

    /// Call when the first user turn completes within a trial session.
    func recordFirstTurn() {
        guard !AdminAllowlist.isCurrentUserAdmin else { return }
        guard let userId, hasStarted, hasRecordedFirstTurn == false else { return }
        hasRecordedFirstTurn = true
        SkillyAnalytics.trackTrialFirstTurn(userId: userId)
    }

    /// Call on each session end. Pass session duration in seconds.
    func recordSessionSeconds(_ seconds: TimeInterval) {
        guard !AdminAllowlist.isCurrentUserAdmin else { return }
        guard let userId, hasStarted, !isExhausted else { return }
        let previousUsed = totalSecondsUsed
        totalSecondsUsed = min(Self.maxTrialSeconds, totalSecondsUsed + seconds)
        // MARK: - Skilly — Notify observers (PlanStrip, PlanCard) to refresh
        objectWillChange.send()

        let prevMinutes = Int(previousUsed / 60)
        let newMinutes = Int(totalSecondsUsed / 60)

        // Minute 5 milestone
        if prevMinutes < 5 && newMinutes >= 5 && !hasRecordedMinute5 {
            hasRecordedMinute5 = true
            SkillyAnalytics.trackTrialMinute5(userId: userId)
        }

        // Minute 10 milestone
        if prevMinutes < 10 && newMinutes >= 10 && !hasRecordedMinute10 {
            hasRecordedMinute10 = true
            SkillyAnalytics.trackTrialMinute10(userId: userId)
        }

        // Exhaustion
        if !isExhausted && totalSecondsUsed >= Self.maxTrialSeconds {
            SkillyAnalytics.trackTrialExhausted(userId: userId)
        }

        // 80% warning (one-time)
        if !hasSent80PercentWarning && totalSecondsUsed >= Self.warningThresholdSeconds {
            hasSent80PercentWarning = true
            SkillyAnalytics.trackTrial80PercentWarning(userId: userId, remainingSeconds: remainingSeconds)
            NotificationCenter.default.post(name: .trial80PercentWarning, object: nil)
        }
    }

    /// Call when entitlement check reveals active subscription after trial.
    /// Fires trial_converted_to_paid once per user.
    func recordConversionToPaid() {
        guard let userId, hasRecordedTrialStarted, !hasConvertedToPaid else { return }
        hasConvertedToPaid = true
        SkillyAnalytics.trackTrialConvertedToPaid(userId: userId)
    }
}

// MARK: - PostHog Events (forwarded to SkillyAnalytics)

extension SkillyAnalytics {
    static func trackTrialStarted(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_started", properties: ["user_id": userId])
    }

    static func trackTrialFirstTurn(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_first_turn", properties: ["user_id": userId])
    }

    static func trackTrialMinute5(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_minute_5", properties: ["user_id": userId])
    }

    static func trackTrialMinute10(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_minute_10", properties: ["user_id": userId])
    }

    static func trackTrialExhausted(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_exhausted", properties: ["user_id": userId])
    }

    static func trackTrial80PercentWarning(userId: String, remainingSeconds: TimeInterval) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_80_percent_warning", properties: [
            "user_id": userId,
            "remaining_seconds": remainingSeconds
        ])
    }

    static func trackTrialConvertedToPaid(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("trial_converted_to_paid", properties: ["user_id": userId])
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let trial80PercentWarning = Notification.Name("SkillyTrial80PercentWarning")
}
