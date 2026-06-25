# AGENTS.md — leanring-buddy (macOS App Target)

This file documents the Swift source files that are **specific to the macOS app target** (`leanring-buddy/`). For the full project architecture, build instructions, and conventions see the root `AGENTS.md` (which is also `CLAUDE.md` via symlink).

## Source Files

All files listed here live in `leanring-buddy/` and auto-compile via Xcode 16's `PBXFileSystemSynchronizedRootGroup` — no `project.pbxproj` edits are needed when adding new Swift files.

### Entry Point

| File | Purpose |
|------|---------|
| `leanring_buddyApp.swift` | `@main` `CompanionAppDelegate`. Creates all singletons (see below), registers `skilly://` URL scheme, starts Sparkle auto-updater. |

Singletons created at startup (all `@StateObject` or `@EnvironmentObject` injected):
`CompanionManager` · `SkillManager` · `AuthManager` · `EntitlementManager` · `TrialTracker` · `UsageTracker` · `MenuBarPanelManager`

### Core Companion

| File | Purpose |
|------|---------|
| `CompanionManager.swift` | Central state machine (~1640 lines). Owns: OpenAI Realtime WebSocket client, overlay manager, audio player, screen capture, entitlement/usage gate. Push-to-talk flow: hotkey press → entitlement check → capture screens + start mic tap → stream to OpenAI → commit on release → parse `[POINT]` tags → animate cursor → record usage. |
| `OpenAIRealtimeClient.swift` | WebSocket client for `wss://api.openai.com/v1/realtime`. Audio in (PCM16 16kHz via `appendAudioChunk()`), screenshots (JPEG via `sendScreenshot()`), TTS out (PCM16 24kHz via `response.audio.delta`). Events via `PassthroughSubject`. |
| `RealtimeAudioPlayer.swift` | PCM16 24kHz playback via `AVAudioEngine` + `AVAudioPlayerNode`. Converts Int16 → Float32 in [-1,1]. |
| `RealtimeTelemetry.swift` | JSONL logger for per-turn metrics (token counts, timing, speech durations, vision usage) written to `~/Library/Application Support/skilly-telemetry.jsonl`. Forwards aggregate metrics to PostHog. |
| `RealtimePricing.swift` | OpenAI Realtime pricing constants (per-million rates). Used by telemetry for cost accounting. |
| `GlobalPushToTalkShortcutMonitor.swift` | Listen-only `CGEvent` tap for system-wide push-to-talk. Publishes `.pressed` / `.released`. More reliable than AppKit global monitors for modifier combos. |
| `BuddyPushToTalkShortcut.swift` | Hotkey shortcut model + Settings UI. Default: `ctrl + option`. |
| `CompanionScreenCaptureUtility.swift` | Multi-monitor screenshots via ScreenCaptureKit. Excludes own windows, sorts by cursor position. |
| `AppDetectionMonitor.swift` | Watches `NSWorkspace` frontmost bundle ID for skill auto-activation. |

### UI

| File | Purpose |
|------|---------|
| `MenuBarPanelManager.swift` | `NSStatusItem` + borderless non-activating `NSPanel`. Auto-dismisses on outside click (0.3s delay for permission dialogs). |
| `CompanionPanelView.swift` | SwiftUI panel shell. Hosts `PlanStrip`, `PanelBodyView`, header, permissions, model picker, footer. Sign-in/sign-out flow; settings gear → `SettingsView`. |
| `PanelBodyView.swift` | Scrollable panel body. "ACTIVE NOW" + "INSTALLED" skill sections. Hover-reveal `SkillRowActionMenu` overflow (Pause/Resume, Reset, View details, Show in Finder, Remove with confirmation). |
| `SettingsView.swift` | Gear popover with three tabs: Account (auth, `PlanCard`, subscription), Voice (language/shortcuts/voice), General (auto-load, startup, help). |
| `OverlayWindow.swift` | Full-screen transparent `NSWindow` per screen (non-activating, all Spaces). Hosts `BlueCursorView` (triangle/waveform/spinner states), 60fps mouse tracking, bezier arc flight animation, streaming text bubble. |
| `CompanionResponseOverlay.swift` | Floating `NSPanel` response text near cursor. Auto-repositions + clamps to screen, auto-hides after 6s. |
| `DesignSystem.swift` | Design tokens: `DS.Colors`, `DS.CornerRadius`, `DS.Spacing`, all button styles (primary/secondary/tertiary/text/outlined/destructive/icon), animation durations, pointer cursor system. |
| `WindowPositionManager.swift` | Permission checks (`AXIsProcessTrusted`, `CGPreflightScreenCaptureAccess`). Window-shrink via Accessibility API. |
| `BYOKSection.swift` | "Bring Your Own Key" Settings section — user-supplied OpenAI API key bypasses proxy+billing. |

### Auth & Analytics

| File | Purpose |
|------|---------|
| `AuthManager.swift` | WorkOS AuthKit OAuth flow. Browser sign-in → `skilly://auth/callback` deep link → code exchange → Keychain storage (`ThisDeviceOnly`, access/refresh/session tokens). Refresh token support. |
| `SkillyAnalytics.swift` | PostHog analytics. Privacy-first: no transcripts, only character counts + element labels. Gated by `analyticsEnabled`. |
| `AdminAllowlist.swift` | Hardcoded WorkOS user IDs (from Info.plist `SkillyAdminWorkOSUserIds`) that bypass trial and monthly cap. |

### Billing & Entitlements

| File | Purpose |
|------|---------|
| `EntitlementManager.swift` | Syncs entitlement from Worker KV `/entitlement`. Status: `none/trial/active/canceled/expired`. Kicks off Polar checkout and customer portal. |
| `TrialTracker.swift` | One-shot 15-min lifetime trial per WorkOS user ID. UserDefaults-backed, never resets. 80% warning at 12 min. |
| `UsageTracker.swift` | 3h/month cap for paid subscribers. Period boundaries from `EntitlementManager`. 80% warning at 2h 24m. |
| `PlanStrip.swift` | Always-visible compact status strip at panel top. Observes all three trackers. |
| `PlanCard.swift` | Detailed plan card in Settings → Account. Progress bar, reset date, "Manage subscription" button. |
| `TrialExhaustedModal.swift` | Shown when 15-min trial ends. CTA: start subscription. |
| `CapReachedModal.swift` | Shown when paid user hits 3h cap. CTA: upgrade plan. |
| `SubscriptionRequiredModal.swift` | Shown when entitlement becomes inactive/expired. |
| `SkillyNotificationManager.swift` | System notifications (UNUserNotificationCenter) for trial/cap warnings. |

### Skill System

| File | Purpose |
|------|---------|
| `SkillManager.swift` | Central skill coordinator. Loads from `~/.skilly/`, manages active/paused/installed state, wires `CurriculumEngine`, exposes `composedSystemPrompt`. Handles Finder drops. |
| `SkillStore.swift` | Disk persistence for `~/.skilly/`. Seeds bundled skills on first launch. |
| `SkillDefinition.swift` | SKILL.md parser: YAML frontmatter → `SkillMetadata`, H2/H3 sections → teaching content. |
| `SkillMetadata.swift` | YAML frontmatter model. Validates skill ID, resolves `bundleId`, defaults `pointing_mode` to `.always`. |
| `CurriculumStage.swift` | Parses `### Stage N: Name` blocks: goals, completion signals, prerequisites, next stage name. |
| `VocabularyEntry.swift` | Parses `### Element Name` vocabulary blocks with description paragraphs. |
| `SkillValidation.swift` | Safety scanner: banned phrases, URL detection, homoglyph normalization, 4K/10K size limits, min 3-char signals. |
| `SkillProgress.swift` | Per-skill progress. `signalBuffer` for curriculum advancement, manual override, total interactions. |
| `PromptBudget.swift` | 6K token ceiling. Progressive vocabulary trimming: all → stage-relevant → top-5 → omit. |
| `CurriculumEngine.swift` | Pure function engine. Keyword-match signals → signalBuffer → auto-advance after 3. Manual set/complete/reset. |
| `SkillPromptComposer.swift` | 5-layer prompt with `skillId:stageId` caching: base → teaching → curriculum → vocabulary → pointing mode. |
| `SkillPanelSection.swift` | SwiftUI skill controls: active/paused/empty states, progress bar, stage list, activate/pause/reset. |
| `SkillRowActionMenu.swift` | Per-skill overflow menu (⋯). Hover/right-click reveal. Pause/Resume, Reset, View details, Show in Finder, Remove. |

### Swift ↔ Rust Bridges

Each bridge `dlopen`s `libskilly_core_ffi.dylib` when present and falls back to the Swift implementation when absent. All wiring is additive, marked `// MARK: - Skilly`.

| File | Purpose |
|------|---------|
| `RustPolicyBridge.swift` | FFI loader for policy. `EntitlementManager.canStartTurn()` + trackers call Rust first, Swift fallback. |
| `RustSkillsBridge.swift` | FFI loader for skill prompt composition; falls back to `SkillPromptComposer`. |
| `RustRealtimeBridge.swift` | FFI loader for realtime replay/lifecycle; Swift fallback. |

### Settings & Config

| File | Purpose |
|------|---------|
| `AppSettings.swift` | UserDefaults-backed: `workerBaseURL`, `voiceName`, `transientCursorMode`, `analyticsEnabled`, `pushToTalkConfig`, `languageCode`, `devMode`, `byokKey`. |
| `AppBundleConfiguration.swift` | Reads Info.plist keys (bundle ID, version, name) at runtime. |

## Important Constraints

- **Do NOT run `xcodebuild`** — it invalidates TCC permissions (screen recording, accessibility, microphone).
- New `.swift` files auto-compile via `PBXFileSystemSynchronizedRootGroup` — no `project.pbxproj` edits needed.
- Always add `import Combine` explicitly when using `@Published` (`SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY = YES`).
- Known non-blocking warnings (do NOT fix): Swift 6 concurrency warnings, deprecated `onChange` in `OverlayWindow.swift`.
- All Skilly additions to upstream files are additive and marked `// MARK: - Skilly`.
