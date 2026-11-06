// MARK: - Skilly
//
//  FirstSessionPolicy.swift
//  leanring-buddy
//
//  Pure decisions for a new user's first spoken answer. Kept free of
//  AppKit, networking, and PostHog so the trial key path, quota recovery,
//  paywall timing, and suggested questions can be tested without a Mac.
//

import Foundation

/// Which OpenAI credential a turn should mint with.
enum RealtimeCredentialPath: Equatable {
    /// Lifetime 15-minute trial on Skilly's hosted key.
    case hostedTrial
    /// Paid hosted plan ($19/mo, 3 hours). Still Skilly's key.
    case hostedPaid
    /// The key saved in Settings. OpenAI bills this key directly.
    case userKey
}

/// Subscription shape the Mac app already knows. Trial time is tracked
/// separately so a saved key cannot hide an unused 15-minute trial.
enum BillingEntitlementKind: Equatable {
    case unset
    case trial
    case hostedActive
    case byokActive
    case expired
}

struct RealtimeCredentialInput: Equatable {
    var hasUserOpenAIKey: Bool
    /// Raw trial clock: 900 seconds used. Ignores the "saved key skips the
    /// trial" bypass — that bypass is what sent new users onto empty keys.
    var trialTimeIsExhausted: Bool
    var entitlementKind: BillingEntitlementKind
    /// Off during rollout. When on, a saved key after the trial requires
    /// the $5/mo BYOK plan. Does not apply while trial time remains.
    var requireBYOKSubscription: Bool
    /// The saved key already failed with no credit this session.
    var userKeyQuotaFailed: Bool
}

enum FirstSessionPolicy {

    static let trialMaxSeconds: TimeInterval = 900

    static func trialTimeIsExhausted(secondsUsed: TimeInterval, isAdmin: Bool) -> Bool {
        if isAdmin { return false }
        return secondsUsed >= trialMaxSeconds
    }

    /// Trial time left always uses the hosted key, even when Settings holds
    /// a personal key. A personal key is only used once the trial is over
    /// (or the account is on the paid BYOK plan) and that key still has credit.
    static func selectCredential(_ input: RealtimeCredentialInput) -> RealtimeCredentialPath {
        if input.entitlementKind == .hostedActive {
            return .hostedPaid
        }

        let trialStillAvailable = !input.trialTimeIsExhausted
            && input.entitlementKind != .expired

        if input.userKeyQuotaFailed && trialStillAvailable {
            return .hostedTrial
        }

        if input.entitlementKind == .byokActive && input.hasUserOpenAIKey && !input.userKeyQuotaFailed {
            return .userKey
        }

        if trialStillAvailable {
            return .hostedTrial
        }

        let byokGateBlocksSavedKey = input.requireBYOKSubscription && input.entitlementKind != .byokActive
        if input.hasUserOpenAIKey && !input.userKeyQuotaFailed && !byokGateBlocksSavedKey {
            return .userKey
        }

        return .hostedTrial
    }

    static func isQuotaFailure(errorCode: String, errorMessage: String) -> Bool {
        let normalizedCode = errorCode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let quotaCodes: Set<String> = [
            "insufficient_quota",
            "credit_balance_exhausted",
            "billing_hard_limit_reached",
            "openai_quota_exhausted",
        ]
        if quotaCodes.contains(normalizedCode) {
            return true
        }

        let normalizedMessage = errorMessage.lowercased()
        let quotaPhrases = [
            "no credits remaining",
            "insufficient_quota",
            "credit_balance_exhausted",
            "exceeded your current quota",
            "billing_hard_limit_reached",
        ]
        return quotaPhrases.contains { normalizedMessage.contains($0) }
    }

    struct QuotaRecovery: Equatable {
        var userMessage: String
        var shouldFallBackToHostedTrial: Bool
        /// Stable analytics reason. Not the raw provider message.
        var analyticsReason: String
    }

    /// What to tell the user, and whether the next attempt may use the hosted trial.
    static func quotaRecovery(
        failedPath: RealtimeCredentialPath,
        trialStillAvailable: Bool
    ) -> QuotaRecovery {
        switch failedPath {
        case .userKey where trialStillAvailable:
            return QuotaRecovery(
                userMessage: "Your OpenAI key has no credit. Add credit, or stay on the free trial — switching you to Skilly's hosted tutor.",
                shouldFallBackToHostedTrial: true,
                analyticsReason: "openai_quota_user_key"
            )
        case .userKey:
            return QuotaRecovery(
                userMessage: "Your OpenAI key has no credit. Add credit in OpenAI billing, or subscribe to Skilly's hosted plan.",
                shouldFallBackToHostedTrial: false,
                analyticsReason: "openai_quota_user_key"
            )
        case .hostedTrial, .hostedPaid:
            return QuotaRecovery(
                userMessage: "Skilly's hosted tutor has no OpenAI credit right now. Try again in a moment, or add your own key in Settings. Your trial time is unchanged.",
                shouldFallBackToHostedTrial: false,
                analyticsReason: "openai_quota_hosted"
            )
        }
    }

    /// Upgrade and trial-ended prompts stay hidden until a spoken answer
    /// has actually played, or the 15-minute trial is really used up.
    static func shouldShowUpgradePrompt(
        hasSuccessfulSpokenAnswer: Bool,
        trialTimeIsExhausted: Bool,
        isTrialLike: Bool
    ) -> Bool {
        isTrialLike && hasSuccessfulSpokenAnswer && !trialTimeIsExhausted
    }

    static func shouldShowTrialEndedPaywall(trialTimeIsExhausted: Bool) -> Bool {
        trialTimeIsExhausted
    }

    struct GuidedQuestions: Equatable {
        var appName: String
        var skillId: String
        var bundleId: String
        var questions: [String]
    }

    /// Example questions the bundled skill can answer. Matched on the
    /// frontmost app's bundle id so the first ask is about the app on screen.
    static func guidedQuestions(forFrontmostBundleId bundleId: String?) -> GuidedQuestions? {
        guard let bundleId else { return nil }
        let normalizedBundleId = bundleId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedBundleId.isEmpty else { return nil }
        return bundledGuidedQuestions.first {
            $0.bundleId.lowercased() == normalizedBundleId
        }
    }

    static let bundledGuidedQuestions: [GuidedQuestions] = [
        GuidedQuestions(
            appName: "Premiere Pro",
            skillId: "premiere-pro-basics",
            bundleId: "com.adobe.PremierePro",
            questions: [
                "Where is the timeline in Premiere Pro?",
                "How do I cut a clip on the timeline?",
                "How do I export this sequence?",
            ]
        ),
        GuidedQuestions(
            appName: "DaVinci Resolve",
            skillId: "davinci-resolve-basics",
            bundleId: "com.blackmagic-design.DaVinciResolve",
            questions: [
                "Where is the Cut page in DaVinci Resolve?",
                "How do I trim a clip on the timeline?",
                "How do I switch to the Color page?",
            ]
        ),
        GuidedQuestions(
            appName: "After Effects",
            skillId: "after-effects-basics",
            bundleId: "com.adobe.AfterEffects",
            questions: [
                "Where is the timeline in After Effects?",
                "How do I add a keyframe?",
                "How do I create a new composition?",
            ]
        ),
        GuidedQuestions(
            appName: "Blender",
            skillId: "blender-fundamentals",
            bundleId: "org.blenderfoundation.blender",
            questions: [
                "How do I orbit the view in Blender?",
                "Where is the Add menu?",
                "How do I render this scene?",
            ]
        ),
        GuidedQuestions(
            appName: "Figma",
            skillId: "figma-basics",
            bundleId: "com.figma.Desktop",
            questions: [
                "How do I create a frame in Figma?",
                "Where is auto layout?",
                "How do I turn this into a component?",
            ]
        ),
    ]

    static var supportedAppNames: [String] {
        bundledGuidedQuestions.map(\.appName)
    }
}

enum FirstQuestionSource: String, Equatable {
    case voice
    case typed
    case suggested
}

struct FirstSessionFunnelState: Equatable {
    var hasAskedFirstQuestion = false
    var hasSuccessfulSpokenAnswer = false
    var hasRecordedFirstAnswerFailure = false
}

enum FirstSessionFunnelEvent: Equatable {
    case firstQuestionAsked(source: FirstQuestionSource, skillId: String?)
    case firstAnswerSucceeded
    case firstAnswerFailed(reason: String)
}

enum FirstSessionFunnel {

    /// Each event fires at most once. A failure can still be followed by a success.
    static func recordQuestionAsked(
        state: inout FirstSessionFunnelState,
        source: FirstQuestionSource,
        skillId: String?
    ) -> FirstSessionFunnelEvent? {
        guard !state.hasAskedFirstQuestion else { return nil }
        state.hasAskedFirstQuestion = true
        return .firstQuestionAsked(source: source, skillId: skillId)
    }

    static func recordAnswerSucceeded(
        state: inout FirstSessionFunnelState
    ) -> FirstSessionFunnelEvent? {
        guard !state.hasSuccessfulSpokenAnswer else { return nil }
        state.hasSuccessfulSpokenAnswer = true
        return .firstAnswerSucceeded
    }

    static func recordAnswerFailed(
        state: inout FirstSessionFunnelState,
        reason: String
    ) -> FirstSessionFunnelEvent? {
        guard !state.hasSuccessfulSpokenAnswer, !state.hasRecordedFirstAnswerFailure else { return nil }
        state.hasRecordedFirstAnswerFailure = true
        let stableReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return .firstAnswerFailed(reason: stableReason.isEmpty ? "unknown" : stableReason)
    }
}
