import UIKit

/// Configuration for the embedded Skilly companion.
public struct SkillyConfig {
    /// Publishable tenant key (`pk_…`), app-id-locked by the backend (Phase 9.0).
    public let key: String
    /// The app owner's authored skill id (their product knowledge / curriculum).
    public var skill: String?
    /// Backend base URL that mints the Realtime token + serves the skill.
    /// Live voice (9.3) activates when this is set; otherwise the companion runs
    /// a simulated turn lifecycle so the embed is demonstrable key-free.
    public var backendUrl: String?
    /// Accent color for the companion UI. Defaults to Skilly blue.
    public var accentColor: UIColor

    public init(
        key: String,
        skill: String? = nil,
        backendUrl: String? = nil,
        accentColor: UIColor = UIColor(red: 0.184, green: 0.420, blue: 1.0, alpha: 1.0)
    ) {
        self.key = key
        self.skill = skill
        self.backendUrl = backendUrl
        self.accentColor = accentColor
    }
}
