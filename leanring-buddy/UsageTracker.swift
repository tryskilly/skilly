import Foundation

/// Tracks the 3-hour monthly usage cap for paid subscribers.
/// Period boundaries come from EntitlementManager, not rolling windows.
/// Keys are suffixed with the WorkOS user ID from AuthManager.shared.currentUser?.id.
@MainActor
final class UsageTracker: ObservableObject {
    static let shared = UsageTracker()

    /// 3 hours in seconds
    static let maxSecondsPerPeriod: TimeInterval = 3 * 60 * 60

    /// 80% warning threshold (2h 24m)
    static let warningThresholdSeconds: TimeInterval = 8640

    private let userDefaults = UserDefaults.standard

    private var userId: String? { AuthManager.shared.currentUser?.id }

    // MARK: - Keys

    private func key(_ suffix: String) -> String {
        guard let id = userId else { return suffix }
        return "usage_\(suffix)_\(id)"
    }

    // MARK: - State

    /// Seconds consumed in the current billing period.
    var secondsUsed: TimeInterval {
        get { userDefaults.double(forKey: key("seconds_used")) }
        set { userDefaults.set(newValue, forKey: key("seconds_used")) }
    }

    var periodStart: Date? {
        get { userDefaults.object(forKey: key("period_start")) as? Date }
        set { userDefaults.set(newValue, forKey: key("period_start")) }
    }

    var periodEnd: Date? {
        get { userDefaults.object(forKey: key("period_end")) as? Date }
        set { userDefaults.set(newValue, forKey: key("period_end")) }
    }

    var remainingSeconds: TimeInterval {
        max(0, Self.maxSecondsPerPeriod - secondsUsed)
    }

    var usageProgress: Double {
        guard Self.maxSecondsPerPeriod > 0 else { return 0 }
        return min(1.0, secondsUsed / Self.maxSecondsPerPeriod)
    }

    var isOverCap: Bool {
        secondsUsed >= Self.maxSecondsPerPeriod
    }

    /// Whether the 80% warning has already been sent for this period.
    var hasSent80PercentWarning: Bool {
        get { userDefaults.bool(forKey: key("warned_80")) }
        set { userDefaults.set(newValue, forKey: key("warned_80")) }
    }

    // MARK: - Period Management

    /// Called by EntitlementManager after fetching entitlement from the Worker.
    func refreshFromEntitlement(periodStart: Date, periodEnd: Date) {
        // If we're in a new period, reset usage
        if let currentPeriodStart = self.periodStart, periodStart > currentPeriodStart {
            secondsUsed = 0
            hasSent80PercentWarning = false
        }
        self.periodStart = periodStart
        self.periodEnd = periodEnd
    }

    // MARK: - Recording

    /// Call on each session end. Pass session duration in seconds.
    func recordSessionSeconds(_ seconds: TimeInterval) {
        guard !isOverCap, let userId else { return }
        let previousUsed = secondsUsed
        secondsUsed = min(Self.maxSecondsPerPeriod, secondsUsed + seconds)

        // 80% warning (one-time per period)
        if !hasSent80PercentWarning && secondsUsed >= Self.warningThresholdSeconds {
            hasSent80PercentWarning = true
            SkillyAnalytics.trackUsageWarningShown(userId: userId, remainingSeconds: remainingSeconds)
            NotificationCenter.default.post(name: .usage80PercentWarning, object: nil)
        }

        // Cap hit
        if previousUsed < Self.maxSecondsPerPeriod && secondsUsed >= Self.maxSecondsPerPeriod {
            SkillyAnalytics.trackUsageCapHit(userId: userId)
        }
    }

    /// Call each time a turn is blocked due to cap.
    func recordTurnBlocked() {
        guard let userId else { return }
        SkillyAnalytics.trackCappedTurnBlocked(userId: userId)
    }
}

// MARK: - PostHog Events (forwarded to SkillyAnalytics)

extension SkillyAnalytics {
    static func trackUsageWarningShown(userId: String, remainingSeconds: TimeInterval) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_usage_warning_shown", properties: [
            "user_id": userId,
            "remaining_seconds": remainingSeconds
        ])
    }

    static func trackUsageCapHit(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_usage_cap_hit", properties: ["user_id": userId])
    }

    static func trackCappedTurnBlocked(userId: String) {
        guard AppSettings.shared.analyticsEnabled else { return }
        PostHogSDK.shared.capture("skilly_capped_turn_blocked", properties: ["user_id": userId])
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let usage80PercentWarning = Notification.Name("SkillyUsage80PercentWarning")
}
