// MARK: - Skilly
//
//  AppSettings.swift
//  leanring-buddy
//
//  Central settings model for Skilly. All user preferences are stored
//  in UserDefaults and exposed as @Published properties so SwiftUI
//  views and managers react to changes automatically.
//

import Combine
import Foundation

@MainActor
final class AppSettings: ObservableObject {

    static let shared = AppSettings()

    // MARK: - Language

    /// Preferred language for speech recognition and AI responses.
    /// Uses ISO 639-1 codes (e.g., "en", "es", "ar", "de").
    /// Default: system language or "en".
    @Published var preferredLanguage: String {
        didSet { UserDefaults.standard.set(preferredLanguage, forKey: "preferredLanguage") }
    }

    /// When true, auto-detect language from the user's speech.
    /// When false, always use preferredLanguage.
    @Published var autoDetectLanguage: Bool {
        didSet { UserDefaults.standard.set(autoDetectLanguage, forKey: "autoDetectLanguage") }
    }

    /// Human-readable name for a language code.
    static let supportedLanguages: [(code: String, name: String)] = [
        ("en", "English"),
        ("es", "Spanish"),
        ("fr", "French"),
        ("de", "German"),
        ("it", "Italian"),
        ("pt", "Portuguese"),
        ("ar", "Arabic"),
        ("zh", "Chinese"),
        ("ja", "Japanese"),
        ("ko", "Korean"),
        ("ru", "Russian"),
        ("hi", "Hindi"),
        ("tr", "Turkish"),
        ("nl", "Dutch"),
        ("pl", "Polish"),
        ("sv", "Swedish"),
    ]

    static func languageName(for code: String) -> String {
        supportedLanguages.first(where: { $0.code == code })?.name ?? code
    }

    // MARK: - Shortcuts

    /// Display name for the push-to-talk shortcut.
    /// Stored as a string key that maps to BuddyPushToTalkShortcut.ShortcutOption.
    @Published var pushToTalkShortcut: String {
        didSet { UserDefaults.standard.set(pushToTalkShortcut, forKey: "pushToTalkShortcut") }
    }

    /// Display name for the cancel shortcut key.
    /// Stored as a keyCode integer.
    @Published var cancelKeyCode: UInt16 {
        didSet { UserDefaults.standard.set(Int(cancelKeyCode), forKey: "cancelKeyCode") }
    }

    /// Human-readable name for the cancel key.
    var cancelKeyDisplayName: String {
        switch cancelKeyCode {
        case 53: return "Escape"
        case 51: return "Delete"
        case 117: return "Forward Delete"
        default: return "Key \(cancelKeyCode)"
        }
    }

    // MARK: - Voice

    /// OpenAI Realtime voice name.
    @Published var voiceName: String {
        didSet { UserDefaults.standard.set(voiceName, forKey: "voiceName") }
    }

    // Pipeline is always OpenAI Realtime — classic pipeline removed.

    // MARK: - Init

    private init() {
        // Language
        let systemLanguage = Locale.current.language.languageCode?.identifier ?? "en"
        self.preferredLanguage = UserDefaults.standard.string(forKey: "preferredLanguage")
            ?? (AppSettings.supportedLanguages.contains(where: { $0.code == systemLanguage }) ? systemLanguage : "en")
        self.autoDetectLanguage = UserDefaults.standard.object(forKey: "autoDetectLanguage") == nil
            ? false  // Default OFF — use preferred language
            : UserDefaults.standard.bool(forKey: "autoDetectLanguage")

        // Shortcuts
        self.pushToTalkShortcut = UserDefaults.standard.string(forKey: "pushToTalkShortcut") ?? "controlOption"
        self.cancelKeyCode = UInt16(UserDefaults.standard.integer(forKey: "cancelKeyCode") == 0
            ? 53  // Default: Escape
            : UserDefaults.standard.integer(forKey: "cancelKeyCode"))

        // Voice
        self.voiceName = UserDefaults.standard.string(forKey: "voiceName") ?? "coral"

        // Pipeline is always OpenAI Realtime
    }
}
