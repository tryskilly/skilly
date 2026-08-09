//
//  OnboardingPermission.swift
//  leanring-buddy
//
//  Pure permission-ordering logic for the guided first-run setup.
//

import Foundation

enum OnboardingPermission: String, CaseIterable, Identifiable, Hashable {
    case microphone
    case screenRecording = "screen_recording"
    case screenContent = "screen_content"
    case accessibility

    var id: String { rawValue }

    var stepNumber: Int {
        (Self.allCases.firstIndex(of: self) ?? 0) + 1
    }

    static func nextRequired(
        hasMicrophone: Bool,
        hasScreenRecording: Bool,
        hasScreenContent: Bool,
        hasAccessibility: Bool
    ) -> OnboardingPermission? {
        if !hasMicrophone { return .microphone }
        if !hasScreenRecording { return .screenRecording }
        if !hasScreenContent { return .screenContent }
        if !hasAccessibility { return .accessibility }
        return nil
    }

    static func completedCount(
        hasMicrophone: Bool,
        hasScreenRecording: Bool,
        hasScreenContent: Bool,
        hasAccessibility: Bool
    ) -> Int {
        [hasMicrophone, hasScreenRecording, hasScreenContent, hasAccessibility]
            .filter { $0 }
            .count
    }
}
