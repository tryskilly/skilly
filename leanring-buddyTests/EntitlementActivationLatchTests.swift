// MARK: - Skilly

import Foundation
import Testing
@testable import Skilly

// MARK: - Test Helpers

/// A UserDefaults backed by a throwaway suite, so each test starts empty and
/// nothing leaks into the developer's real defaults.
private func makeThrowawaySuite() -> (defaults: UserDefaults, name: String) {
    let name = "skilly.tests.activation.\(UUID().uuidString)"
    return (UserDefaults(suiteName: name)!, name)
}

private func destroy(suite name: String) {
    UserDefaults.standard.removePersistentDomain(forName: name)
}

// MARK: - Tests

/// Guards the fix for the bug where `skilly_subscription_activated` never fired:
/// `refresh()` runs on every launch and every 5s during post-checkout polling, so
/// the latch is what stands between "one event per paying customer" and either
/// zero events (the original bug) or an endless stream of duplicates.
@MainActor
@Suite("Entitlement checkout and activation")
struct EntitlementActivationLatchTests {

    @Test("blocks a second checkout while one is already starting")
    func blocksConcurrentCheckout() {
        let decision = EntitlementManager.checkoutStartDecision(
            status: .trial(remainingSeconds: 0),
            isCheckoutInProgress: true
        )

        #expect(decision == .ignoreAlreadyInProgress)
    }

    @Test("routes active subscribers to subscription management")
    func routesActiveSubscriberToPortal() {
        let decision = EntitlementManager.checkoutStartDecision(
            status: .active(periodEnd: Date().addingTimeInterval(3_600)),
            isCheckoutInProgress: false
        )

        #expect(decision == .openCustomerPortal)
    }

    @Test("allows checkout for non-active entitlement states")
    func allowsCheckoutForEligibleStates() {
        let eligibleStatuses: [EntitlementStatus] = [
            .none,
            .trial(remainingSeconds: 0),
            .canceled(accessUntil: Date().addingTimeInterval(3_600)),
            .expired,
        ]

        for eligibleStatus in eligibleStatuses {
            let decision = EntitlementManager.checkoutStartDecision(
                status: eligibleStatus,
                isCheckoutInProgress: false
            )
            #expect(decision == .createCheckout)
        }
    }

    @Test("claims exactly once for the same user")
    func claimsOnlyOnce() {
        let (defaults, name) = makeThrowawaySuite()
        defer { destroy(suite: name) }

        #expect(EntitlementManager.claimActivationLatch(userDefaults: defaults, userId: "user_a") == true)
        // refresh() polls every 5s after checkout — these are the repeat calls.
        #expect(EntitlementManager.claimActivationLatch(userDefaults: defaults, userId: "user_a") == false)
        #expect(EntitlementManager.claimActivationLatch(userDefaults: defaults, userId: "user_a") == false)
    }

    @Test("latches per user, not globally")
    func latchesPerUser() {
        let (defaults, name) = makeThrowawaySuite()
        defer { destroy(suite: name) }

        #expect(EntitlementManager.claimActivationLatch(userDefaults: defaults, userId: "user_a") == true)
        // A different account signing in on the same Mac is its own activation.
        #expect(EntitlementManager.claimActivationLatch(userDefaults: defaults, userId: "user_b") == true)
        #expect(EntitlementManager.claimActivationLatch(userDefaults: defaults, userId: "user_a") == false)
    }

    @Test("latch survives relaunch")
    func survivesRelaunch() {
        let (first, name) = makeThrowawaySuite()
        defer { destroy(suite: name) }

        #expect(EntitlementManager.claimActivationLatch(userDefaults: first, userId: "user_a") == true)

        // Same backing store, fresh instance — stands in for a cold start, where
        // refresh() sees .active again and must not re-report the activation.
        let afterRelaunch = UserDefaults(suiteName: name)!
        #expect(EntitlementManager.claimActivationLatch(userDefaults: afterRelaunch, userId: "user_a") == false)
    }
}
