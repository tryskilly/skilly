// MARK: - Skilly
//
// Pure sign-in handoff rules for checkout. The Mac app opens WorkOS in the
// browser and waits for skilly://auth/callback. A second Subscribe click used
// to mint a new OAuth state while the first browser tab was still open, so
// the deep link no longer matched and checkout died as missing_auth_state.

import Foundation

struct CheckoutAuthHandoff: Equatable, Sendable {
    var state: String
    var createdAt: Date
    var authorizeURL: String?
}

enum CheckoutSignInBeginDecision: Equatable, Sendable {
    case startNew
    case reuseExisting
}

enum CheckoutAuthCallbackDecision: Equatable, Sendable {
    case accept
    case missingState
    case mismatch
    case expired
}

enum CheckoutAuthHandoffPolicy {
    /// Longer than a slow magic-link round trip. WorkOS may still reject an
    /// older authorization code; that failure starts a fresh handoff instead
    /// of rotating state out from under a tab the user is still looking at.
    static let lifetime: TimeInterval = 30 * 60

    static func beginDecision(existing: CheckoutAuthHandoff?, now: Date) -> CheckoutSignInBeginDecision {
        guard let existing, !existing.state.isEmpty else { return .startNew }
        if now.timeIntervalSince(existing.createdAt) > lifetime { return .startNew }
        return .reuseExisting
    }

    static func callbackDecision(
        pending: CheckoutAuthHandoff?,
        callbackState: String?,
        now: Date
    ) -> CheckoutAuthCallbackDecision {
        guard let pending, let callbackState, !callbackState.isEmpty else { return .missingState }
        if now.timeIntervalSince(pending.createdAt) > lifetime { return .expired }
        if callbackState != pending.state { return .mismatch }
        return .accept
    }

    /// A failed callback must keep the "open checkout after sign-in" flag.
    /// Only a successful exchange consumes it, so the next valid return still
    /// continues into Polar instead of dumping the user back on the paywall.
    static func keepsCheckoutIntent(after decision: CheckoutAuthCallbackDecision) -> Bool {
        decision != .accept
    }

    static func checkoutFailureReason(for decision: CheckoutAuthCallbackDecision) -> String? {
        switch decision {
        case .accept:
            return nil
        case .missingState:
            return "missing_auth_state"
        case .mismatch:
            return "auth_state_mismatch"
        case .expired:
            return "auth_state_expired"
        }
    }

    static func userFacingMessage(for decision: CheckoutAuthCallbackDecision) -> String {
        switch decision {
        case .accept:
            return ""
        case .missingState:
            return "Sign-in didn't return a security token. Click Subscribe again."
        case .mismatch:
            return "That sign-in link doesn't match this Mac. Click Subscribe again."
        case .expired:
            return "Sign-in expired. Click Subscribe again to get a fresh link."
        }
    }
}
