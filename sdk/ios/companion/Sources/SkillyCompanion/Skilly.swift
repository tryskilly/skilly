import UIKit

/// The embeddable Skilly companion for iOS apps.
///
/// Usage:
/// ```swift
/// Skilly.shared.configure(SkillyConfig(key: "pk_live_…", skill: "acme-onboarding"))
/// Skilly.shared.on { event in print(event) }
/// // ...later, e.g. from a "Help" button:
/// Skilly.shared.start(goal: "set up your first project")
/// ```
///
/// Phase 9.1 is the embed SKELETON: it mounts the overlay and runs a simulated
/// turn lifecycle so the flow is demonstrable. The host-app UI digest + pointing
/// (9.2) and the OpenAI Realtime voice pipeline (9.3) are layered on next, reusing
/// the shared `core/mobile-sdk` brain and the multi-tenant backend (app-id-locked,
/// Phase 9.0).
@MainActor
public final class Skilly {
    public static let shared = Skilly()
    private init() {}

    private var config: SkillyConfig?
    private var overlay: SkillyOverlay?
    private var handlers: [(SkillyEvent) -> Void] = []
    private var turnInProgress = false

    /// Mount the companion overlay into the host app. Call once at startup.
    public func configure(_ config: SkillyConfig) {
        guard overlay == nil else {
            print("[skilly] already configured; call teardown() first to re-configure.")
            return
        }
        guard !config.key.isEmpty else {
            print("[skilly] configure() requires a publishable `key`.")
            return
        }
        self.config = config

        let overlay = SkillyOverlay(accentColor: config.accentColor)
        overlay.onLauncherTapped = { [weak self] in self?.start() }
        overlay.mount()
        self.overlay = overlay
    }

    /// Open the companion and run a turn. 9.1 simulates the lifecycle
    /// (listening → thinking → speaking → complete); 9.3 replaces this with the
    /// OpenAI Realtime voice pipeline.
    public func start(goal: String? = nil) {
        guard let overlay, !turnInProgress else { return }
        turnInProgress = true
        emit(.turn(goal: goal))

        overlay.setState(.listening)
        overlay.setBubble("Listening…")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.overlay?.setState(.thinking)
            self?.overlay?.setBubble("Thinking…")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
            guard let self, let overlay = self.overlay else { return }
            overlay.setState(.speaking)
            overlay.setBubble(
                goal.map { "Let's get started with: \($0)" }
                    ?? "Hi! I'm Skilly. Ask me how to do anything in this app and I'll point you to it."
            )
            // Pointing demo (9.2 resolves a real accessibility target here).
            if let bounds = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first?.coordinateSpace.bounds {
                overlay.showCursor()
                overlay.setCursorPosition(CGPoint(x: bounds.midX, y: bounds.midY))
            }
            self.emit(.point(target: "screen", label: "demo target"))
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) { [weak self] in
            guard let self else { return }
            self.overlay?.setState(.idle)
            self.overlay?.setBubble("")
            self.overlay?.hideCursor()
            self.turnInProgress = false
            self.emit(.complete)
        }
    }

    /// Observe companion events. Multiple observers are supported.
    public func on(_ handler: @escaping (SkillyEvent) -> Void) {
        handlers.append(handler)
    }

    /// Remove the overlay and clear observers.
    public func teardown() {
        overlay?.teardown()
        overlay = nil
        config = nil
        handlers = []
        turnInProgress = false
    }

    private func emit(_ event: SkillyEvent) {
        for handler in handlers {
            handler(event)
        }
    }
}
