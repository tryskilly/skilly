import Combine
import Foundation
import PostHog

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

    private struct PendingUsageReport: Codable, Equatable {
        let userId: String
        let eventId: String
        let sessionId: String?
        let seconds: Int
        let result: String
        let source: String
        let model: String?
        let audioInputTokens: Int?
        let audioOutputTokens: Int?
        let textInputTokens: Int?
        let textOutputTokens: Int?
        let cachedInputTokens: Int?
        let totalTokens: Int?
        let estimatedCostUsd: String?
    }

    private var outboxFlushTask: Task<Void, Never>?
    private var outboxFlushRequested = false
    private static let maxOutboxEntries = 100

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
        // MARK: - Skilly — Prefer shared Rust policy when available.
        if let rustUsageIsOverCap = RustPolicyBridge.shared.usageIsOverCap(
            userID: userId,
            usageSecondsUsed: secondsUsed,
            adminWorkOSUserIDs: AdminAllowlist.allConfiguredAdminWorkOSUserIDs
        ) {
            return rustUsageIsOverCap
        }

        // MARK: - Skilly — Admin bypass: allowlisted users never hit the monthly cap.
        if AdminAllowlist.isCurrentUserAdmin { return false }
        return secondsUsed >= Self.maxSecondsPerPeriod
    }

    /// Whether the 80% warning has already been sent for this period.
    var hasSent80PercentWarning: Bool {
        get { userDefaults.bool(forKey: key("warned_80")) }
        set { userDefaults.set(newValue, forKey: key("warned_80")) }
    }

    // MARK: - Period Management

    /// Called by EntitlementManager after fetching entitlement from Studio.
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
        guard !AdminAllowlist.isCurrentUserAdmin else { return }
        guard !isOverCap, let userId else { return }
        let previousUsed = secondsUsed
        secondsUsed = min(Self.maxSecondsPerPeriod, secondsUsed + seconds)
        // MARK: - Skilly — Notify observers (PlanStrip, PlanCard) to refresh
        objectWillChange.send()

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

    func reportStudioMacUsage(
        seconds: TimeInterval,
        result: String,
        source: String,
        model: String?,
        usage: RealtimeUsage?,
        estimatedCostUsd: Double?,
        sessionId: String? = nil,
        eventId: String? = nil
    ) {
        guard AuthManager.shared.isAuthenticated,
              let userId = AuthManager.shared.currentUser?.id,
              let url = URL(string: "\(AppSettings.shared.studioBackendBaseURL)/api/mac/usage") else {
            return
        }

        // Generate one id for this logical report. Every retry below reuses the
        // same id so a timeout cannot double-count a completed turn.
        let reportEventId = eventId ?? UUID().uuidString
        let report = PendingUsageReport(
            userId: userId,
            eventId: reportEventId,
            sessionId: sessionId,
            seconds: max(0, Int(seconds.rounded())),
            result: result,
            source: source,
            model: model,
            audioInputTokens: usage?.audio_input_tokens,
            audioOutputTokens: usage?.audio_output_tokens,
            textInputTokens: usage?.text_input_tokens,
            textOutputTokens: usage?.text_output_tokens,
            cachedInputTokens: usage?.cached_input_tokens,
            totalTokens: usage?.total_tokens,
            estimatedCostUsd: estimatedCostUsd.map { String(format: "%.8f", $0) }
        )
        enqueue(report)
        flushOutbox(for: userId, url: url)
    }

    private func outboxKey(for userId: String) -> String {
        "studio_usage_outbox_\(userId)"
    }

    private func loadOutbox(for userId: String) -> [PendingUsageReport] {
        guard let data = userDefaults.data(forKey: outboxKey(for: userId)),
              let reports = try? JSONDecoder().decode([PendingUsageReport].self, from: data) else {
            return []
        }
        return reports
    }

    private func saveOutbox(_ reports: [PendingUsageReport], for userId: String) -> Bool {
        // Never evict unacknowledged usage. A full queue is explicit backpressure;
        // the entitlement gate blocks the next hosted start until it drains.
        guard reports.count <= Self.maxOutboxEntries,
              let data = try? JSONEncoder().encode(reports) else { return false }
        userDefaults.set(data, forKey: outboxKey(for: userId))
        return true
    }

    @discardableResult
    private func enqueue(_ report: PendingUsageReport) -> Bool {
        var reports = loadOutbox(for: report.userId)
        guard !reports.contains(where: { $0.eventId == report.eventId }) else { return true }
        reports.append(report)
        guard saveOutbox(reports, for: report.userId) else {
            userDefaults.set(true, forKey: "studio_usage_outbox_full_\(report.userId)")
            NotificationCenter.default.post(name: .studioUsageSyncRequired, object: nil)
            return false
        }
        userDefaults.set(false, forKey: "studio_usage_outbox_full_\(report.userId)")
        return true
    }

    private func flushOutbox(for userId: String, url: URL) {
        if outboxFlushTask != nil {
            outboxFlushRequested = true
            return
        }
        outboxFlushTask = Task { [weak self] in
            guard let self else { return }
            defer {
                self.outboxFlushTask = nil
                if self.outboxFlushRequested {
                    self.outboxFlushRequested = false
                    self.flushOutbox(for: userId, url: url)
                }
            }
            let reports = self.loadOutbox(for: userId)
            guard !reports.isEmpty else { return }
            for report in reports {
                guard !Task.isCancelled,
                      AuthManager.shared.isAuthenticated,
                      AuthManager.shared.currentUser?.id == userId else { return }

                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                guard AuthManager.shared.applyWorkerSessionAuthorization(to: &request) else { return }
                var body: [String: Any] = [
                    "eventId": report.eventId,
                    "seconds": report.seconds,
                    "result": report.result,
                    "source": report.source,
                ]
                if let sessionId = report.sessionId { body["sessionId"] = sessionId }
                if let model = report.model { body["model"] = model }
                if let value = report.audioInputTokens { body["audioInputTokens"] = value }
                if let value = report.audioOutputTokens { body["audioOutputTokens"] = value }
                if let value = report.textInputTokens { body["textInputTokens"] = value }
                if let value = report.textOutputTokens { body["textOutputTokens"] = value }
                if let value = report.cachedInputTokens { body["cachedInputTokens"] = value }
                if let value = report.totalTokens { body["totalTokens"] = value }
                if let value = report.estimatedCostUsd { body["estimatedCostUsd"] = value }
                guard let encodedBody = try? JSONSerialization.data(withJSONObject: body) else { return }
                request.httpBody = encodedBody

                var delivered = false
                for attempt in 0..<3 {
                    do {
                        let (_, response) = try await URLSession.shared.data(for: request)
                        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                        if (200..<300).contains(status) { delivered = true; break }
                        let retryable = status == 408 || status == 425 || status == 429 || status >= 500
                        guard retryable, attempt < 2 else { break }
                    } catch {
                        guard attempt < 2 else { break }
                    }
                    try? await Task.sleep(for: .milliseconds(300 * (attempt + 1)))
                }
                guard delivered else { return }
                var remaining = self.loadOutbox(for: userId)
                remaining.removeAll { $0.eventId == report.eventId }
                _ = self.saveOutbox(remaining, for: userId)
                if remaining.count < Self.maxOutboxEntries {
                    self.userDefaults.set(false, forKey: "studio_usage_outbox_full_\(userId)")
                }
            }
        }
    }

    /// Flushes reports queued while offline or while auth was recovering.
    /// The queue is keyed by the current WorkOS user, so an account switch
    /// cannot submit another user's telemetry.
    func flushPendingStudioUsage() {
        guard AuthManager.shared.isAuthenticated,
              let userId = AuthManager.shared.currentUser?.id,
              let url = URL(string: "\(AppSettings.shared.studioBackendBaseURL)/api/mac/usage") else {
            return
        }
        flushOutbox(for: userId, url: url)
    }

    var isOutboxFull: Bool {
        guard let userId else { return false }
        return userDefaults.bool(forKey: "studio_usage_outbox_full_\(userId)")
            || loadOutbox(for: userId).count >= Self.maxOutboxEntries
    }

    /// Call each time a turn is blocked due to cap.
    func recordTurnBlocked() {
        guard !AdminAllowlist.isCurrentUserAdmin else { return }
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
    static let studioUsageSyncRequired = Notification.Name("StudioUsageSyncRequired")
}
