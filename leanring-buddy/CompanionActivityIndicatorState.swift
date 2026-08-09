//
//  CompanionActivityIndicatorState.swift
//  leanring-buddy
//
//  User-facing activity state for the persistent capture indicator.
//

import Foundation

enum CompanionActivityIndicatorState: Equatable {
    case pushToTalkCapture
    case liveTutorCapture
    case processing
    case responding

    static func resolve(
        voiceState: CompanionVoiceState,
        isLiveTutorModeActive: Bool
    ) -> CompanionActivityIndicatorState? {
        if isLiveTutorModeActive {
            return .liveTutorCapture
        }

        switch voiceState {
        case .idle:
            return nil
        case .listening:
            return .pushToTalkCapture
        case .processing:
            return .processing
        case .responding:
            return .responding
        }
    }

    var title: String {
        switch self {
        case .pushToTalkCapture:
            return "Skilly is listening"
        case .liveTutorCapture:
            return "Live Tutor is active"
        case .processing:
            return "Skilly is thinking"
        case .responding:
            return "Skilly is speaking"
        }
    }

    var detail: String {
        switch self {
        case .pushToTalkCapture:
            return "Mic on · Screen context captured once"
        case .liveTutorCapture:
            return "Mic on · Screen context updates when you speak"
        case .processing, .responding:
            return "Microphone off · Esc stops immediately"
        }
    }

    var analyticsMode: String {
        switch self {
        case .pushToTalkCapture:
            return "push_to_talk"
        case .liveTutorCapture:
            return "live_tutor"
        case .processing:
            return "processing"
        case .responding:
            return "responding"
        }
    }

    var isCapturing: Bool {
        switch self {
        case .pushToTalkCapture, .liveTutorCapture:
            return true
        case .processing, .responding:
            return false
        }
    }
}
