// MARK: - Skilly

import Foundation

enum SettingsPresentationState {
    static func accountAccessibilityLabel(isSignedIn: Bool) -> String {
        isSignedIn ? "Signed in" : "Signed out"
    }
}

enum OverlayAccessibilityState {
    static func exposesProcessingSpinner(
        isBuddyVisible: Bool,
        voiceState: CompanionVoiceState,
        cursorOpacity: Double
    ) -> Bool {
        isBuddyVisible && voiceState == .processing && cursorOpacity > 0
    }
}
