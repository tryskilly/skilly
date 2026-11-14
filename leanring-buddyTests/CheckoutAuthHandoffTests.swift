// MARK: - Skilly

import Foundation
import Testing
@testable import Skilly

@Suite("Checkout auth handoff")
struct CheckoutAuthHandoffTests {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func handoff(age: TimeInterval, state: String = "state-1234567890abcd") -> CheckoutAuthHandoff {
        CheckoutAuthHandoff(
            state: state,
            createdAt: now.addingTimeInterval(-age),
            authorizeURL: "https://auth.example/start"
        )
    }

    @Test("a second sign-in reuses an unexpired handoff")
    func reusesFreshHandoff() {
        let decision = CheckoutAuthHandoffPolicy.beginDecision(existing: handoff(age: 60), now: now)
        #expect(decision == .reuseExisting)
    }

    @Test("an expired handoff is not reused")
    func expiredHandoffStartsOver() {
        let decision = CheckoutAuthHandoffPolicy.beginDecision(
            existing: handoff(age: CheckoutAuthHandoffPolicy.lifetime + 1),
            now: now
        )
        #expect(decision == .startNew)
        #expect(CheckoutAuthHandoffPolicy.beginDecision(existing: nil, now: now) == .startNew)
    }

    @Test("callback state must match the handoff that opened the browser")
    func callbackMustMatch() {
        let pending = handoff(age: 30)
        #expect(CheckoutAuthHandoffPolicy.callbackDecision(pending: pending, callbackState: pending.state, now: now) == .accept)
        #expect(CheckoutAuthHandoffPolicy.callbackDecision(pending: pending, callbackState: "different-state-value", now: now) == .mismatch)
        #expect(CheckoutAuthHandoffPolicy.callbackDecision(pending: pending, callbackState: nil, now: now) == .missingState)
        #expect(CheckoutAuthHandoffPolicy.callbackDecision(pending: nil, callbackState: pending.state, now: now) == .missingState)
    }

    @Test("a slow return expires instead of being treated as a mismatch")
    func slowReturnExpires() {
        let pending = handoff(age: CheckoutAuthHandoffPolicy.lifetime + 5)
        let decision = CheckoutAuthHandoffPolicy.callbackDecision(pending: pending, callbackState: pending.state, now: now)
        #expect(decision == .expired)
        #expect(CheckoutAuthHandoffPolicy.checkoutFailureReason(for: decision) == "auth_state_expired")
    }

    @Test("a failed callback keeps the queued checkout")
    func failedCallbackKeepsCheckoutIntent() {
        #expect(CheckoutAuthHandoffPolicy.keepsCheckoutIntent(after: .mismatch) == true)
        #expect(CheckoutAuthHandoffPolicy.keepsCheckoutIntent(after: .expired) == true)
        #expect(CheckoutAuthHandoffPolicy.keepsCheckoutIntent(after: .missingState) == true)
        #expect(CheckoutAuthHandoffPolicy.keepsCheckoutIntent(after: .accept) == false)
        #expect(CheckoutAuthHandoffPolicy.checkoutFailureReason(for: .mismatch) == "auth_state_mismatch")
        #expect(CheckoutAuthHandoffPolicy.checkoutFailureReason(for: .missingState) == "missing_auth_state")
    }
}
