import Foundation

/// Events the host app can observe via `Skilly.shared.on { ... }`.
public enum SkillyEvent {
    /// The companion opened / a turn started.
    case turn(goal: String?)
    /// The AI asked to point at an element (resolved target + label). Wired in 9.2.
    case point(target: String, label: String)
    /// A turn finished.
    case complete
    /// A non-fatal error surfaced to the host.
    case error(message: String)
}
