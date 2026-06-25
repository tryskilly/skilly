# SkillyCompanion (iOS)

The embeddable Skilly companion for **iOS apps** — a mobile-app owner adds this
Swift Package, and their users get an in-app tutor/guide that sees the screen,
points at UI, and talks them through it. The iOS analog of `@skilly/web`. See
`docs/architecture/mobile-sdk-b2b-sketch.md`.

## Status — Phase 9.1 (embed skeleton)

What's here:
- A Swift Package `SkillyCompanion` (iOS 15+).
- The public `Skilly` API (`configure` / `start` / `on` / `teardown`).
- A **passthrough overlay window** (`SkillyOverlay`): a floating launcher button,
  a response bubble, and the blue cursor — hosted above the host app, with touches
  passing through to the app everywhere except the launcher.
- A simulated turn lifecycle (listening → thinking → speaking → complete) so the
  embed is demonstrable without a backend or key.

Layered on next: **9.2** host-app UI digest (accessibility hierarchy) + selector
pointing · **9.3** OpenAI Realtime voice (`AVAudioSession` + WebRTC), token from
the backend (app-id-locked, Phase 9.0), reusing the `core/mobile-sdk` brain.

## Install (Swift Package Manager)

```
.package(path: "sdk/ios/companion")   // or the published repo URL
```
…and add `SkillyCompanion` to your target's dependencies.

## Usage

```swift
import SkillyCompanion

// once, e.g. in SceneDelegate / App startup:
Skilly.shared.configure(SkillyConfig(
    key: "pk_live_…",            // app-id-locked by the backend
    skill: "acme-onboarding",
    backendUrl: "https://api.tryskilly.app" // omit for the simulated demo
))
Skilly.shared.on { event in
    switch event {
    case .complete: print("turn done")
    case .error(let message): print("skilly error:", message)
    default: break
    }
}

// later, e.g. from a "Help" button:
Skilly.shared.start(goal: "set up your first project")
```

The host app needs `NSMicrophoneUsageDescription` in its Info.plist (for the voice
pipeline in 9.3). No screen-recording or accessibility-service permission is
needed — the SDK reads the host app's own UI in-process.

## Validate

Type-checks against the iOS SDK without Xcode:

```bash
cd sdk/ios/companion
xcrun --sdk iphonesimulator swiftc -typecheck -target arm64-apple-ios15.0-simulator \
  Sources/SkillyCompanion/*.swift
```

Full runtime validation (the overlay appearing, touch passthrough, the simulated
turn) needs an Xcode build into a host app + simulator.

> Note: this is the **companion product** SDK. The generated UniFFI **brain**
> bindings (policy/realtime) live in `sdk/ios/generated/` and are wired into the
> voice/turn logic in Phase 9.3.
