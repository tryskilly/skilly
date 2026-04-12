import AppKit
import Combine
import Foundation

// MARK: - Block Reason

enum BlockReason: Sendable {
    case trialExhausted
    case capReached
    case subscriptionInactive
    case expired
    case none

    var displayMessage: String {
        switch self {
        case .trialExhausted:
            return "Your free trial has ended. Subscribe to continue."
        case .capReached:
            return "You've reached your monthly usage limit."
        case .subscriptionInactive:
            return "No active subscription found."
        case .expired:
            return "Your subscription has expired."
        case .none:
            return ""
        }
    }
}

// MARK: - Entitlement Status

enum EntitlementStatus: Sendable {
    case none
    case trial(remainingSeconds: TimeInterval)
    case active(periodEnd: Date)
    case canceled(accessUntil: Date)
    case expired
}

// MARK: - Entitlement Record (from Worker KV)

struct EntitlementRecord: Codable {
    let user_id: String
    let status: String
    let period_start: String?
    let period_end: String?
    let plan: String?

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// Parse an ISO 8601 date string, trying with and without fractional seconds.
    private static func parseISO8601(_ string: String) -> Date? {
        iso8601Formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }

    var parsedStatus: EntitlementStatus {
        switch status {
        case "active":
            if let endStr = period_end, let end = Self.parseISO8601(endStr) {
                return .active(periodEnd: end)
            }
            return .none
        case "canceled":
            if let endStr = period_end, let end = Self.parseISO8601(endStr) {
                return .canceled(accessUntil: end)
            }
            return .expired
        case "none", "":
            return .none
        default:
            return .none
        }
    }
}

// MARK: - EntitlementManager

@MainActor
final class EntitlementManager: ObservableObject {
    static let shared = EntitlementManager()

    @Published private(set) var status: EntitlementStatus = .none
    @Published private(set) var isLoading: Bool = false

    private var workerBaseURL: String {
        AppSettings.shared.workerBaseURL
    }

    private init() {}

    // MARK: - Fetch

    /// Call on app launch and after any checkout return.
    func refresh() async {
        guard AuthManager.shared.isAuthenticated,
              let userId = AuthManager.shared.currentUser?.id else {
            status = .none
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            guard let url = URL(string: "\(workerBaseURL)/entitlement?user_id=\(userId)") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: forContentType)

            let (data, _) = try await URLSession.shared.data(for: request)
            let record = try JSONDecoder().decode(EntitlementRecord.self, from: data)

            applyEntitlementRecord(record)

            if case .active = status {
                TrialTracker.shared.recordConversionToPaid()
            }
        } catch {
            // Network failure: leave existing status unchanged
        }
    }

    // MARK: - Apply Record

    private func applyEntitlementRecord(_ record: EntitlementRecord) {
        status = record.parsedStatus

        switch record.parsedStatus {
        case .active(let periodEnd):
            let periodStart: Date
            if let startStr = record.period_start {
                periodStart = ISO8601DateFormatter().date(from: startStr) ?? Date()
            } else {
                periodStart = Date()
            }
            UsageTracker.shared.refreshFromEntitlement(periodStart: periodStart, periodEnd: periodEnd)

        case .canceled(let accessUntil):
            if accessUntil > Date() {
                // period boundaries stay as-is from the last active record
            } else {
                status = .expired
            }

        case .trial(let remaining):
            status = .trial(remainingSeconds: remaining)

        case .none:
            if !TrialTracker.shared.isExhausted {
                status = .trial(remainingSeconds: TrialTracker.shared.remainingSeconds)
            }

        case .expired:
            break
        }
    }

    // MARK: - Authorization Check

    /// Returns (allowed, reason). Call before starting any billable turn.
    func canStartTurn() -> (allowed: Bool, reason: BlockReason?) {
        switch status {
        case .none:
            if TrialTracker.shared.isExhausted {
                return (false, .trialExhausted)
            }
            return (true, nil)

        case .trial:
            if TrialTracker.shared.isExhausted {
                return (false, .trialExhausted)
            }
            return (true, nil)

        case .active:
            if UsageTracker.shared.isOverCap {
                UsageTracker.shared.recordTurnBlocked()
                return (false, .capReached)
            }
            return (true, nil)

        case .canceled(let accessUntil):
            if accessUntil > Date() {
                if UsageTracker.shared.isOverCap {
                    UsageTracker.shared.recordTurnBlocked()
                    return (false, .capReached)
                }
                return (true, nil)
            }
            return (false, .expired)

        case .expired:
            return (false, .expired)
        }
    }

    // MARK: - Checkout

    /// Opens Polar checkout in the default browser.
    func startCheckout() async {
        guard AuthManager.shared.isAuthenticated,
              let userId = AuthManager.shared.currentUser?.id,
              let email = AuthManager.shared.currentUser?.email else { return }

        SkillyAnalytics.trackCheckoutStarted(userId: userId)

        do {
            guard let url = URL(string: "\(workerBaseURL)/checkout/create") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            struct CheckoutPayload: Codable { let user_id: String; let email: String }
            request.httpBody = try JSONEncoder().encode(CheckoutPayload(user_id: userId, email: email))

            let (data, _) = try await URLSession.shared.data(for: request)
            struct CheckoutResponse: Codable { let checkout_url: String }
            let response = try JSONDecoder().decode(CheckoutResponse.self, from: data)

            if let checkoutURL = URL(string: response.checkout_url) {
                NSWorkspace.shared.open(checkoutURL)
                // Start polling for entitlement changes. The webhook may
                // take a few seconds to arrive after the user pays. Poll
                // every 5 seconds for up to 2 minutes so the PlanStrip
                // updates without requiring the deep link or a relaunch.
                startPostCheckoutPolling()
            }
        } catch {
            // Log error silently
        }
    }

    // MARK: - Skilly — Post-checkout entitlement polling
    private var postCheckoutPollingTask: Task<Void, Never>?

    private func startPostCheckoutPolling() {
        postCheckoutPollingTask?.cancel()
        postCheckoutPollingTask = Task {
            for _ in 0..<24 {  // 24 × 5s = 2 minutes
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                await refresh()
                // Stop polling once we detect an active subscription
                if case .active = status {
                    #if DEBUG
                    print("🎯 Skilly: Post-checkout poll detected active subscription")
                    #endif
                    return
                }
            }
        }
    }

    // MARK: - Trial Begin

    /// Called when user clicks "Start Free Trial" from the subscription required modal.
    func beginFreeTrial() {
        TrialTracker.shared.beginTrialIfNeeded()
        status = .trial(remainingSeconds: TrialTracker.shared.remainingSeconds)
    }
}

// MARK: - Helper

private let forContentType = "Content-Type"
