import Foundation
import Testing
@testable import Skilly

@Suite("First session credential, paywall, and questions")
struct FirstSessionPolicyTests {

    private func input(
        hasUserOpenAIKey: Bool = false,
        trialTimeIsExhausted: Bool = false,
        entitlementKind: BillingEntitlementKind = .trial,
        requireBYOKSubscription: Bool = false,
        userKeyQuotaFailed: Bool = false
    ) -> RealtimeCredentialInput {
        RealtimeCredentialInput(
            hasUserOpenAIKey: hasUserOpenAIKey,
            trialTimeIsExhausted: trialTimeIsExhausted,
            entitlementKind: entitlementKind,
            requireBYOKSubscription: requireBYOKSubscription,
            userKeyQuotaFailed: userKeyQuotaFailed
        )
    }

    @Test("A new trial uses the hosted key even when a personal key is saved")
    func trialIgnoresSavedKey() {
        let withKey = input(hasUserOpenAIKey: true, entitlementKind: .unset)
        let withoutKey = input(hasUserOpenAIKey: false, entitlementKind: .trial)
        #expect(FirstSessionPolicy.selectCredential(withKey) == .hostedTrial)
        #expect(FirstSessionPolicy.selectCredential(withoutKey) == .hostedTrial)
    }

    @Test("Trial time is the raw 15-minute clock, not the saved-key bypass")
    func trialClockIgnoresSavedKey() {
        #expect(FirstSessionPolicy.trialTimeIsExhausted(secondsUsed: 899, isAdmin: false) == false)
        #expect(FirstSessionPolicy.trialTimeIsExhausted(secondsUsed: 900, isAdmin: false) == true)
        #expect(FirstSessionPolicy.trialTimeIsExhausted(secondsUsed: 900, isAdmin: true) == false)
    }

    @Test("After the trial, a saved key is used unless the BYOK plan gate is on")
    func savedKeyAfterTrial() {
        let rollout = input(
            hasUserOpenAIKey: true,
            trialTimeIsExhausted: true,
            entitlementKind: .expired,
            requireBYOKSubscription: false
        )
        let gated = input(
            hasUserOpenAIKey: true,
            trialTimeIsExhausted: true,
            entitlementKind: .expired,
            requireBYOKSubscription: true
        )
        #expect(FirstSessionPolicy.selectCredential(rollout) == .userKey)
        #expect(FirstSessionPolicy.selectCredential(gated) == .hostedTrial)
    }

    @Test("Paid hosted stays on Skilly's key, and paid BYOK stays on the user's key")
    func paidPlansKeepTheirKeys() {
        let hosted = input(hasUserOpenAIKey: true, entitlementKind: .hostedActive)
        let byok = input(hasUserOpenAIKey: true, trialTimeIsExhausted: true, entitlementKind: .byokActive)
        #expect(FirstSessionPolicy.selectCredential(hosted) == .hostedPaid)
        #expect(FirstSessionPolicy.selectCredential(byok) == .userKey)
    }

    @Test("A user key with no credit falls back to the hosted trial while time remains")
    func quotaFallsBackToHostedTrial() {
        let duringTrial = input(
            hasUserOpenAIKey: true,
            entitlementKind: .byokActive,
            userKeyQuotaFailed: true
        )
        let afterTrial = input(
            hasUserOpenAIKey: true,
            trialTimeIsExhausted: true,
            entitlementKind: .byokActive,
            userKeyQuotaFailed: true
        )
        #expect(FirstSessionPolicy.selectCredential(duringTrial) == .hostedTrial)
        #expect(FirstSessionPolicy.selectCredential(afterTrial) == .userKey)

        let recovery = FirstSessionPolicy.quotaRecovery(failedPath: .userKey, trialStillAvailable: true)
        #expect(recovery.shouldFallBackToHostedTrial)
        #expect(recovery.userMessage.contains("no credit"))
        #expect(recovery.userMessage.contains("trial"))
        #expect(recovery.analyticsReason == "openai_quota_user_key")
    }

    @Test("A hosted credit failure explains what happened and does not pretend the trial ended")
    func hostedQuotaIsRecoverable() {
        #expect(FirstSessionPolicy.isQuotaFailure(errorCode: "credit_balance_exhausted", errorMessage: ""))
        #expect(FirstSessionPolicy.isQuotaFailure(
            errorCode: "",
            errorMessage: "You have no credits remaining. Add credits to continue using the API."
        ))
        #expect(FirstSessionPolicy.isQuotaFailure(errorCode: "insufficient_quota", errorMessage: "quota"))
        #expect(!FirstSessionPolicy.isQuotaFailure(errorCode: "auth_expired", errorMessage: "please sign in"))

        let recovery = FirstSessionPolicy.quotaRecovery(failedPath: .hostedTrial, trialStillAvailable: true)
        #expect(!recovery.shouldFallBackToHostedTrial)
        #expect(recovery.userMessage.contains("hosted tutor"))
        #expect(recovery.userMessage.contains("trial time is unchanged"))
        #expect(recovery.analyticsReason == "openai_quota_hosted")
    }

    @Test("The upgrade prompt waits for a spoken answer, and the paywall waits for the trial to end")
    func paywallTiming() {
        #expect(!FirstSessionPolicy.shouldShowUpgradePrompt(
            hasSuccessfulSpokenAnswer: false,
            trialTimeIsExhausted: false,
            isTrialLike: true
        ))
        #expect(FirstSessionPolicy.shouldShowUpgradePrompt(
            hasSuccessfulSpokenAnswer: true,
            trialTimeIsExhausted: false,
            isTrialLike: true
        ))
        #expect(!FirstSessionPolicy.shouldShowUpgradePrompt(
            hasSuccessfulSpokenAnswer: true,
            trialTimeIsExhausted: true,
            isTrialLike: true
        ))
        #expect(!FirstSessionPolicy.shouldShowTrialEndedPaywall(trialTimeIsExhausted: false))
        #expect(FirstSessionPolicy.shouldShowTrialEndedPaywall(trialTimeIsExhausted: true))
    }

    @Test("Guided questions follow the frontmost bundled app")
    func guidedQuestionsMatchFrontmostApp() {
        let premiere = FirstSessionPolicy.guidedQuestions(forFrontmostBundleId: "com.adobe.PremierePro")
        #expect(premiere?.appName == "Premiere Pro")
        #expect(premiere?.questions.count == 3)
        #expect(premiere?.questions.allSatisfy { $0.localizedCaseInsensitiveContains("Premiere") || $0.localizedCaseInsensitiveContains("clip") || $0.localizedCaseInsensitiveContains("export") } == true)

        let figma = FirstSessionPolicy.guidedQuestions(forFrontmostBundleId: "COM.FIGMA.DESKTOP")
        #expect(figma?.skillId == "figma-basics")
        #expect(figma?.questions.count == 3)

        let knownBundleIds = Set(FirstSessionPolicy.bundledGuidedQuestions.map { $0.bundleId.lowercased() })
        #expect(knownBundleIds == Set([
            "com.adobe.premierepro",
            "com.blackmagic-design.davinciresolve",
            "com.adobe.aftereffects",
            "org.blenderfoundation.blender",
            "com.figma.desktop",
        ]))
        #expect(FirstSessionPolicy.guidedQuestions(forFrontmostBundleId: "com.apple.finder") == nil)
        #expect(FirstSessionPolicy.guidedQuestions(forFrontmostBundleId: nil) == nil)
    }

    @Test("First-answer funnel events fire once, and a failure can still be followed by a success")
    func funnelEvents() {
        var state = FirstSessionFunnelState()
        let asked = FirstSessionFunnel.recordQuestionAsked(state: &state, source: .suggested, skillId: "figma-basics")
        #expect(asked == .firstQuestionAsked(source: .suggested, skillId: "figma-basics"))
        #expect(FirstSessionFunnel.recordQuestionAsked(state: &state, source: .voice, skillId: nil) == nil)

        let failed = FirstSessionFunnel.recordAnswerFailed(state: &state, reason: "openai_quota_hosted")
        #expect(failed == .firstAnswerFailed(reason: "openai_quota_hosted"))
        #expect(FirstSessionFunnel.recordAnswerFailed(state: &state, reason: "again") == nil)

        let succeeded = FirstSessionFunnel.recordAnswerSucceeded(state: &state)
        #expect(succeeded == .firstAnswerSucceeded)
        #expect(FirstSessionFunnel.recordAnswerFailed(state: &state, reason: "late") == nil)
        #expect(FirstSessionFunnel.recordAnswerSucceeded(state: &state) == nil)
    }
}
