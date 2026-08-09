//
//  leanring_buddyTests.swift
//  leanring-buddyTests
//
//  Created by thorfinn on 3/2/26.
//

import Testing
@testable import Skilly

@MainActor
struct leanring_buddyTests {

    @Test func firstPermissionRequestUsesSystemPromptOnly() async throws {
        let presentationDestination = WindowPositionManager.permissionRequestPresentationDestination(
            hasPermissionNow: false,
            hasAttemptedSystemPrompt: false
        )

        #expect(presentationDestination == .systemPrompt)
    }

    @Test func repeatedPermissionRequestOpensSystemSettings() async throws {
        let presentationDestination = WindowPositionManager.permissionRequestPresentationDestination(
            hasPermissionNow: false,
            hasAttemptedSystemPrompt: true
        )

        #expect(presentationDestination == .systemSettings)
    }

    @Test func knownGrantedScreenRecordingPermissionSkipsTheGate() async throws {
        let shouldTreatPermissionAsGranted = WindowPositionManager.shouldTreatScreenRecordingPermissionAsGrantedForSessionLaunch(
            hasScreenRecordingPermissionNow: false,
            hasPreviouslyConfirmedScreenRecordingPermission: true
        )

        #expect(shouldTreatPermissionAsGranted)
    }

    @Test func onboardingRequestsOnlyTheNextPermission() async throws {
        #expect(OnboardingPermission.microphone.stepNumber == 1)
        #expect(OnboardingPermission.screenRecording.stepNumber == 2)
        #expect(OnboardingPermission.screenContent.stepNumber == 3)
        #expect(OnboardingPermission.accessibility.stepNumber == 4)

        #expect(OnboardingPermission.nextRequired(
            hasMicrophone: false,
            hasScreenRecording: false,
            hasScreenContent: false,
            hasAccessibility: false
        ) == .microphone)

        #expect(OnboardingPermission.nextRequired(
            hasMicrophone: true,
            hasScreenRecording: false,
            hasScreenContent: false,
            hasAccessibility: false
        ) == .screenRecording)

        #expect(OnboardingPermission.nextRequired(
            hasMicrophone: true,
            hasScreenRecording: true,
            hasScreenContent: false,
            hasAccessibility: false
        ) == .screenContent)

        #expect(OnboardingPermission.nextRequired(
            hasMicrophone: true,
            hasScreenRecording: true,
            hasScreenContent: true,
            hasAccessibility: false
        ) == .accessibility)
    }

    @Test func onboardingCompletesAfterAllPermissions() async throws {
        let nextPermission = OnboardingPermission.nextRequired(
            hasMicrophone: true,
            hasScreenRecording: true,
            hasScreenContent: true,
            hasAccessibility: true
        )
        let completedCount = OnboardingPermission.completedCount(
            hasMicrophone: true,
            hasScreenRecording: true,
            hasScreenContent: true,
            hasAccessibility: true
        )

        #expect(nextPermission == nil)
        #expect(completedCount == OnboardingPermission.allCases.count)
    }

}
