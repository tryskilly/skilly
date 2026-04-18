# Skilly - Agent Instructions

## Overview

Skilly (tryskilly.app) is a macOS menu bar AI teaching companion that sees the user's screen, speaks to them, and physically points at UI elements — powered by domain-specific teaching skills. Built as a fork of [Clicky by Farza](https://github.com/farzaa/clicky) (MIT License).

Lives entirely in the macOS status bar (no dock icon, no main window). Clicking the menu bar icon opens a custom floating panel with companion voice controls. Uses push-to-talk (ctrl+option) to capture voice input and screenshots, then streams them via a single OpenAI Realtime WebSocket connection that handles transcription, vision, chat, and TTS in one unified pipeline. A blue cursor overlay can fly to and point at UI elements the AI references on any connected monitor.

When a teaching skill is active (e.g., Blender Fundamentals), the companion's system prompt is layered with domain expertise, curriculum context, and UI vocabulary — turning generic AI assistance into expert tutoring.

All API keys live on a Cloudflare Worker proxy — nothing sensitive ships in the app.

## Architecture

- **App Type**: Menu bar-only (`LSUIElement=true`), no dock icon or main window
- **Bundle ID**: `app.tryskilly.skilly`
- **Framework**: SwiftUI (macOS native) with AppKit bridging for menu bar panel and cursor overlay
- **Pattern**: MVVM with `@StateObject` / `@Published` state management
- **AI Pipeline**: OpenAI Realtime API via WebSocket (`gpt-4o-realtime-preview`) — single connection handles audio streaming, transcription, vision, chat, and TTS
- **Screen Capture**: ScreenCaptureKit (macOS 14.2+), multi-monitor support
- **Voice Input**: Push-to-talk via `AVAudioEngine` + `appendAudioChunk()` to OpenAI Realtime. System-wide keyboard shortcut via listen-only CGEvent tap.
- **Element Pointing**: AI embeds `[POINT:x,y:label:screenN]` tags in responses. The overlay parses these, maps coordinates to the correct monitor, and animates the blue cursor along a bezier arc to the target. Edge-proximity check suppresses animation when coordinates are within 5% of any screen edge.
- **Auth**: WorkOS AuthKit via browser → `skilly://auth/callback` deep link → Keychain session storage
- **Skill System**: SKILL.md files parsed at runtime, layered into system prompt with curriculum tracking
- **Concurrency**: `@MainActor` isolation, async/await throughout
- **Analytics**: PostHog via `SkillyAnalytics.swift` (own project, not upstream)
- **Cross-platform Migration Scaffold**: Rust workspace at `core/` (`domain`, `policy`, `skills`, `realtime`, `ffi`) plus shell bootstrap crates under `apps/` to centralize platform-agnostic policy/orchestration logic while keeping native OS shells for UI/capabilities
- **Policy Bridge**: `RustPolicyBridge.swift` dynamically loads `libskilly_core_ffi.dylib` (when available) so entitlement checks can use shared Rust policy with Swift fallback
- **Skills Bridge**: `RustSkillsBridge.swift` dynamically loads `libskilly_core_ffi.dylib` (when available) so skill prompt composition can use shared Rust logic with Swift fallback
- **Realtime Bridge**: `RustRealtimeBridge.swift` dynamically loads `libskilly_core_ffi.dylib` (when available) so turn/session transitions can use shared Rust realtime state-machine logic with Swift fallback

### API Proxy (Cloudflare Worker)

The app never calls external APIs directly. All requests go through a Cloudflare Worker (`worker/src/index.ts`) deployed at `skilly-proxy.eng-mohamedszaied.workers.dev`.

| Route | Method | Upstream | Purpose |
|-------|--------|----------|---------|
| `/openai/token` | GET | `api.openai.com/v1/realtime/client_secrets` | Returns short-lived OpenAI Realtime client secret (not raw API key) |
| `/auth/url` | GET | — | Returns WorkOS AuthKit authorization URL |
| `/auth/callback` | GET | — | Catches WorkOS redirect, redirects to `skilly://auth/callback` |
| `/auth/token` | POST | `api.workos.com/user_management/authenticate` | Exchanges auth code for user profile + tokens |
| `/checkout/create` | POST | `api.polar.sh/v1/checkouts` | Creates a Polar checkout session for subscription upgrade |
| `/entitlement` | GET | Worker KV | Returns cached entitlement record (status, period end, cap) for the authenticated user |
| `/portal` | GET | Polar customer portal | Returns customer portal URL for subscription management |
| `/webhooks/polar` | POST | — | Polar webhook receiver (Standard Webhooks signature), updates KV entitlement on subscription events |
| `/chat` | POST | `api.anthropic.com/v1/messages` | Claude Messages API (legacy, unused by current pipeline) |
| `/tts` | POST | `api.elevenlabs.io/v1/text-to-speech/{voiceId}` | ElevenLabs TTS (legacy, unused by current pipeline) |
| `/transcribe-token` | POST | `streaming.assemblyai.com/v3/token` | AssemblyAI token (legacy, unused by current pipeline) |

Worker secrets: `OPENAI_API_KEY`, `WORKOS_API_KEY`, `SESSION_TOKEN_SECRET`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`
Worker vars: `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `POLAR_PRODUCT_ID`
Worker KV: entitlement records keyed by WorkOS user ID (production Polar + WorkOS)
Legacy secrets (unused by current pipeline): `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

### Key Architecture Decisions

**Menu Bar Panel Pattern**: The companion panel uses `NSStatusItem` for the menu bar icon and a custom borderless `NSPanel` for the floating control panel. This gives full control over appearance (dark, rounded corners, custom shadow) and avoids the standard macOS menu/popover chrome. The panel is non-activating so it doesn't steal focus. A global event monitor auto-dismisses it on outside clicks.

**Cursor Overlay**: A full-screen transparent `NSWindow` hosts the blue cursor companion. It's non-activating, joins all Spaces, and never steals focus. The cursor position, response text, waveform, and pointing animations all render in this overlay via SwiftUI through `NSHostingView`.

**Global Push-To-Talk Shortcut**: Background push-to-talk uses a listen-only `CGEvent` tap instead of an AppKit global monitor so modifier-based shortcuts like `ctrl + option` are detected more reliably while the app is running in the background.

**OpenAI Realtime Pipeline**: A single WebSocket connection to OpenAI handles the entire voice interaction: audio in (PCM16 mono 16kHz via `appendAudioChunk()`), screenshots (JPEG via `sendScreenshot()`), transcription, vision, LLM response, and TTS audio out (PCM16 24kHz via `response.audio.delta`). This replaces the previous chained pipeline of AssemblyAI + Claude + ElevenLabs.

**Token Relay**: OpenAI API key lives as a Worker secret. The app fetches a short-lived Realtime client secret via `GET /openai/token` at session start, so the raw OpenAI API key is never returned to the client.

**Transient Cursor Mode**: When "Show Skilly" is off, pressing the hotkey fades in the cursor overlay for the duration of the interaction (recording → response → TTS → optional pointing), then fades it out automatically after 1 second of inactivity.

**Skill Prompt Composition**: When a skill is active, the system prompt is composed in 5 layers: base Skilly prompt → teaching instructions → curriculum context → UI vocabulary (budget-trimmed) → pointing mode instruction. When no skill is active, the original base prompt is used unchanged.

**WorkOS Auth Flow**: User clicks "Sign in" → app generates OAuth `state` → browser opens WorkOS AuthKit via Worker `/auth/url?state=...` → WorkOS redirects to Worker `/auth/callback` → Worker serves HTML that redirects to `skilly://auth/callback?code=XXX&state=YYY` → app validates `state` and exchanges code via Worker `/auth/token` → stores access/refresh + Worker session token in Keychain.

**Billing & Entitlements**: Paywall is a three-layer gate. (1) `TrialTracker` — one-shot 15-minute lifetime free trial per WorkOS user, keyed by user ID, never resets once exhausted. (2) `UsageTracker` — 3-hour monthly cap for paid subscribers, period boundaries sourced from `EntitlementManager` (not rolling windows), resets on period change. (3) `EntitlementManager` — syncs entitlement records from Worker KV via `/entitlement`, exposes `EntitlementStatus` (`none`/`trial`/`active`/`canceled`/`expired`) and `BlockReason`, kicks off checkout via `/checkout/create` and portal via `/portal`. The `PlanStrip` (always visible at panel top) and `PlanCard` (Settings → Account) observe all three trackers and render contextually styled states (healthy/low/empty/ended). When blocked, the appropriate modal is shown: `TrialExhaustedModal`, `CapReachedModal`, or `SubscriptionRequiredModal`. Polar webhook events update KV; the app refreshes entitlement after checkout completes. Pricing constants live in `RealtimePricing.swift` for cost accounting; per-turn usage metrics are logged by `RealtimeTelemetry.swift` to `~/Library/Application Support/skilly-telemetry.jsonl`.

## Key Files

### Core App (leanring-buddy/)

| File | Lines | Purpose |
|------|-------|---------|
| `leanring_buddyApp.swift` | ~170 | Menu bar app entry point. `@main` struct with `CompanionAppDelegate`. Creates singletons: `CompanionManager`, `SkillManager`, `AuthManager`, `EntitlementManager`, `TrialTracker`, `UsageTracker`. Registers `skilly://` URL scheme handler for auth callbacks. |
| `CompanionManager.swift` | ~1730 | Central state machine. Owns OpenAI Realtime client, overlay manager, audio player, screen capture, skill manager, entitlement/usage enforcement. Push-to-talk flow: hotkey press → check entitlement → capture screens + start audio tap → send to OpenAI → commit on release → parse `[POINT]` tags → animate cursor → record usage. |
| `MenuBarPanelManager.swift` | ~250 | NSStatusItem + custom `NSPanel` lifecycle. Creates panel, hosts `CompanionPanelView` via `NSHostingView`, handles click-outside dismissal with 0.3s delay for permission dialogs. |
| `CompanionPanelView.swift` | ~1000 | SwiftUI panel shell. Hosts `PlanStrip` (always visible), `PanelBodyView`, header, permissions, model picker, footer. WorkOS sign-in/sign-out flow, settings gear popover routing to `SettingsView`. |
| `PanelBodyView.swift` | ~550 | Main scrollable panel body with "ACTIVE NOW" and "INSTALLED" skill sections. Per-skill `SkillRowActionMenu` overflow menus (Pause/Resume, Reset, View details, Show in Finder, Remove) reveal on hover or right-click. Remove shows confirmation. |
| `SettingsView.swift` | ~430 | Popover settings from the gear icon. Three tabs: Account (auth, privacy, `PlanCard`, subscription management), Voice (language/shortcuts/voice config), General (skills auto-load, startup, help). |
| `OverlayWindow.swift` | ~970 | Full-screen transparent overlay per screen. `BlueCursorView` with cursor states (triangle/waveform/spinner), 60fps mouse tracking, bezier arc flight animation, navigation bubble with character-by-character streaming text. |
| `CompanionResponseOverlay.swift` | ~230 | Floating response text panel that follows cursor. NSPanel-based, auto-repositions near cursor, clamps to visible screen bounds, auto-hides after 6s. |
| `CompanionScreenCaptureUtility.swift` | ~130 | Multi-monitor screenshot via ScreenCaptureKit. Filters out own app's windows, sorts displays by cursor position, returns AppKit coordinates. |
| `OpenAIRealtimeClient.swift` | ~770 | OpenAI Realtime WebSocket client. Connects to `wss://api.openai.com/v1/realtime`. Handles audio in/out, screenshots, session pre-warm, usage reporting via `response.done`. Events published via `PassthroughSubject`. |
| `RealtimeAudioPlayer.swift` | ~115 | PCM16 24kHz audio playback via `AVAudioEngine` + `AVAudioPlayerNode`. Converts Int16 → Float32 normalized to [-1, 1]. |
| `RealtimeTelemetry.swift` | ~450 | JSONL telemetry logger for Realtime sessions. Per-turn rows (token counts, timing, speech durations, vision usage) and session summary written to `~/Library/Application Support/skilly-telemetry.jsonl`. Also forwards aggregate metrics to PostHog. |
| `RealtimePricing.swift` | ~40 | OpenAI Realtime API pricing constants (per-million rates for audio in/out, text in/out, cached input). Used by telemetry for cost accounting. |
| `GlobalPushToTalkShortcutMonitor.swift` | ~150 | System-wide push-to-talk via listen-only `CGEvent` tap. Publishes `.pressed` / `.released` events. |
| `DesignSystem.swift` | ~870 | Design tokens. `DS.Colors`, `DS.CornerRadius`, `DS.Spacing`, button styles (primary/secondary/tertiary/text/outlined/destructive/icon), animation durations, pointer cursor system. |
| `WindowPositionManager.swift` | ~270 | Permission checks (`AXIsProcessTrusted`, `CGPreflightScreenCaptureAccess`). Window shrinking via Accessibility API. Screen recording permission fallback via UserDefaults. |
| `AppSettings.swift` | ~195 | UserDefaults-backed settings: worker base URL, voice name, transient cursor mode, analytics opt-out, push-to-talk config, language, dev mode toggles. |
| `AppBundleConfiguration.swift` | ~30 | Runtime config reader for Info.plist keys (bundle ID, version, name). |
| `AppDetectionMonitor.swift` | ~50 | `NSWorkspace` frontmost app bundle ID monitoring for auto-activating skills. |
| `BuddyPushToTalkShortcut.swift` | ~210 | Hotkey shortcut model + customization UI support. Default: `control + option`. Wraps `GlobalPushToTalkShortcutMonitor` and exposes recording/editing state for Settings. |
| `SkillyNotificationManager.swift` | ~80 | User-facing system notifications (via `UNUserNotificationCenter`) for trial warnings, cap warnings, and subscription state changes. |
| `RustPolicyBridge.swift` | ~200 | Dynamic Rust FFI loader for policy checks. Calls `skilly_policy_can_start_turn` from `libskilly_core_ffi.dylib` when present and falls back to Swift logic when unavailable. |
| `RustSkillsBridge.swift` | ~220 | Dynamic Rust FFI loader for skills prompt composition. Calls `skilly_skills_compose_prompt_json` from `libskilly_core_ffi.dylib` when present and falls back to Swift prompt composition when unavailable. |
| `RustRealtimeBridge.swift` | ~180 | Dynamic Rust FFI loader for realtime replay summaries. Calls `skilly_realtime_replay_events_json` from `libskilly_core_ffi.dylib` when present and falls back to Swift lifecycle behavior when unavailable. |

### Auth & Analytics

| File | Lines | Purpose |
|------|-------|---------|
| `AuthManager.swift` | ~410 | WorkOS AuthKit flow: browser sign-in via `/auth/url`, OAuth `state` generation/validation (persisted to UserDefaults to survive restarts), deep link callback `skilly://auth/callback`, code exchange via `/auth/token`, Keychain storage with `ThisDeviceOnly` accessibility (access/refresh/session tokens), refresh token support, sign-out. |
| `SkillyAnalytics.swift` | ~225 | PostHog analytics. Privacy-first: no transcript/response text captured, only character counts and element labels. Gated by `analyticsEnabled` setting. Events for push-to-talk, skill activation, curriculum advancement, entitlement state, paywall impressions. |

### Billing & Entitlements

| File | Lines | Purpose |
|------|-------|---------|
| `EntitlementManager.swift` | ~310 | Central entitlement singleton. Defines `EntitlementStatus` (`none`/`trial`/`active`/`canceled`/`expired`) and `BlockReason`. Syncs records from Worker `/entitlement` KV, starts checkout via `/checkout/create`, opens customer portal via `/portal`. Publishes `status` to SwiftUI observers. |
| `TrialTracker.swift` | ~195 | One-shot 15-minute lifetime free trial per WorkOS user. Keyed by user ID, UserDefaults-backed. Never resets once exhausted. 80% warning threshold at 12 min. |
| `UsageTracker.swift` | ~140 | 3-hour monthly cap for paid subscribers. Period boundaries sourced from `EntitlementManager` (not rolling windows). 80% warning threshold at 2h 24m. Keyed by user ID. |
| `PlanStrip.swift` | ~310 | Compact plan-state strip always visible at panel top. Observes all three trackers. Styled contextually: subtle in healthy states (TRIAL, ACTIVE), visually weighted in alert states (LOW, EMPTY, ENDED). |
| `PlanCard.swift` | ~250 | Detailed plan card in Settings → Account. Status, time consumed this month, progress bar, reset date, "Manage subscription" button. Falls back to trial display when Worker hasn't synced. |
| `TrialExhaustedModal.swift` | ~65 | Modal shown when 15-min trial runs out. CTA: "Start Subscription" → `EntitlementManager.startCheckout()`. |
| `CapReachedModal.swift` | ~65 | Modal shown when paid user hits 3h monthly cap. CTA: "Upgrade Plan". |
| `SubscriptionRequiredModal.swift` | ~70 | Modal shown when entitlement becomes inactive/expired. |

### Skill System

| File | Lines | Purpose |
|------|-------|---------|
| `SkillManager.swift` | ~640 | Central skill coordinator. Loads skills from `~/.skilly/`, manages activation/deactivation/pause, wires `CurriculumEngine` into voice pipeline, exposes `composedSystemPrompt` consumed by `CompanionManager`. Handles skill install from Finder drops and overflow menu actions. |
| `SkillStore.swift` | ~295 | Disk persistence for `~/.skilly/`. Loads skills from subdirectories, saves/loads progress JSON and config JSON, seeds bundled skills from app bundle on first launch. |
| `SkillDefinition.swift` | ~245 | SKILL.md parser. Line-by-line state machine: YAML frontmatter → `SkillMetadata`, splits markdown body by H2/H3 headings into sections. |
| `SkillMetadata.swift` | ~405 | YAML frontmatter data model. Parses flat key-value pairs and block sequences, validates skill ID format, resolves `bundleId` from known mappings, defaults `pointing_mode` to `.always`. |
| `CurriculumStage.swift` | ~245 | Parses H3 stage blocks (`### Stage N: Name`). Extracts description, goals, completion signals, prerequisites, next stage name, generates URL-safe stage ID. |
| `VocabularyEntry.swift` | ~90 | Parses H3 vocabulary blocks (`### Element Name` + description paragraphs). Joins lines with spaces, paragraphs with `\n\n`. |
| `SkillValidation.swift` | ~295 | Safety scanner: banned phrase list (prompt injection, data exfiltration), URL detection, homoglyph normalization, size limits (4K teaching tokens, 10K total), min 3-char completion signals. |
| `SkillProgress.swift` | ~95 | Per-skill progress tracker. `signalBuffer` for curriculum advancement, manual override flag, total interactions, version migration by stage position. |
| `PromptBudget.swift` | ~90 | 6K token ceiling with progressive vocabulary trimming: all → stage-relevant → top-5 → omit. |
| `CurriculumEngine.swift` | ~180 | Pure function engine. Detects completion signals (keyword match) in transcript+response, accumulates in `signalBuffer`, auto-advances after 3 signals, supports manual stage set/complete/reset. |
| `SkillPromptComposer.swift` | ~200 | 5-layer prompt composition with caching by `skillId:stageId`. Layers: base → teaching → curriculum → vocabulary (budget-trimmed) → pointing mode. |
| `SkillPanelSection.swift` | ~645 | SwiftUI skill controls in panel: active/paused/empty states, progress bar, stage list, activate/pause/reset buttons. |
| `SkillRowActionMenu.swift` | ~105 | Per-skill overflow menu (⋯) in `PanelBodyView` rows. Hover/right-click reveal. Actions: Pause/Resume, Reset progress, View details, Show in Finder, Remove (with confirmation). |

### Cloudflare Worker

| File | Lines | Purpose |
|------|-------|---------|
| `worker/src/index.ts` | ~900 | Worker proxy. Routes: `/openai/token` (active, authenticated, ephemeral secret mint), `/auth/url`, `/auth/callback`, `/auth/token` (active), `/checkout/create`, `/entitlement`, `/portal`, `/webhooks/polar` (Polar billing, Standard Webhooks signatures, KV-backed entitlements), `/chat`, `/tts`, `/transcribe-token` (legacy, authenticated). All API keys stored as secrets. |

### Rust Core Scaffold (`core/`)

| File | Lines | Purpose |
|------|-------|---------|
| `Cargo.toml` | ~20 | Workspace definition for cross-platform Rust core crates plus shell bootstrap binaries. |
| `core/domain/src/lib.rs` | ~60 | Shared data contracts (`EntitlementState`, `PolicyInput`, `PolicyDecision`, `BlockReason`, `PolicyConfig`) used by native shells. |
| `core/policy/src/lib.rs` | ~180 | Deterministic entitlement/trial/cap/admin decision engine plus baseline policy tests aligned with current Swift behavior. |
| `core/policy/fixtures/can_start_turn_cases.json` | ~30 | Starter parity fixture cases for policy behavior validation across host platforms. |
| `core/ffi/src/lib.rs` | ~320 | C ABI boundary for native shells. Exposes policy decision entrypoints, skill prompt composition entrypoint, and realtime replay-summary entrypoint (`can_start_turn`, `trial_is_exhausted`, `usage_is_over_cap`, `skills_compose_prompt_json`, `realtime_replay_events_json`). |
| `core/skills/src/lib.rs` | ~260 | Shared prompt-composition module (curriculum/vocabulary layers, pointing mode instructions, vocabulary trimming) with fixture-driven tests. |
| `core/skills/fixtures/compose_prompt_fixture.json` | ~40 | Fixture defining expected composed prompt output for Rust skills-core parity checks. |
| `core/realtime/src/lib.rs` | ~300 | Deterministic realtime turn/session state machine with replay harness and transition validation. |
| `core/realtime/fixtures/replay_traces.json` | ~45 | Replay-trace fixture corpus for realtime lifecycle validation. |

### Shell Bootstrap (`apps/`)

| File | Lines | Purpose |
|------|-------|---------|
| `apps/windows-shell/src/main.rs` | ~110 | Windows shell bootstrap binary that runs mocked auth + entitlement + turn-start smoke flow through shared Rust core. |
| `apps/linux-shell/src/main.rs` | ~110 | Linux shell bootstrap binary that runs mocked auth + entitlement + turn-start smoke flow through shared Rust core. |

### Architecture Docs

| File | Lines | Purpose |
|------|-------|---------|
| `docs/architecture/core-boundaries.md` | ~35 | Migration boundary doc defining what remains native vs what moves into Rust core. |
| `docs/architecture/capability-matrix.md` | ~30 | Capability matrix for macOS/Windows/Linux parity planning and adapter ownership. |
| `docs/architecture/rust-core-native-shells-prd.md` | ~80 | Product requirements for the cross-platform migration (goals, constraints, metrics, rollout). |
| `docs/architecture/rust-core-native-shells-roadmap.md` | ~110 | Phase-by-phase execution roadmap with exit criteria and dependencies. |
| `docs/architecture/rust-core-native-shells-test-spec.md` | ~100 | Verification strategy and migration release gates across Rust core and platform shells. |
| `docs/architecture/adr-001-rust-core-native-shells.md` | ~45 | Architecture decision record selecting Rust core + native shell approach. |
| `docs/architecture/adapter-contracts.md` | ~70 | Native shell adapter interface contracts (auth, entitlement, capture, hotkey, overlay, audio, permissions) for core integration. |

### CI Workflow

| File | Lines | Purpose |
|------|-------|---------|
| `.github/workflows/rust-core-shells.yml` | ~50 | Workspace Rust checks/tests plus FFI smoke and Windows/Linux shell smoke jobs. |

### Skill Files

The repo ships 5 bundled skills under `skills/`, also copied into the app bundle under `Resources/skills/` so new users get them without downloading anything.

| File | Purpose |
|------|---------|
| `skills/blender-fundamentals/SKILL.md` | Blender Fundamentals — 6 curriculum stages (navigation → first render), UI vocabulary, common beginner mistakes. `pointing_mode: always`. Includes `examples/` directory. |
| `skills/after-effects-basics/SKILL.md` | Adobe After Effects basics — rewritten from official docs. Compositions, layers, keyframes, effects. |
| `skills/premiere-pro-basics/SKILL.md` | Adobe Premiere Pro basics — rewritten from official docs. Timeline editing, transitions, export. |
| `skills/davinci-resolve-basics/SKILL.md` | DaVinci Resolve basics — rewritten from official docs. Cut/Edit/Color/Fairlight/Deliver pages. |
| `skills/figma-basics/SKILL.md` | Figma basics — rewritten from official docs. Frames, components, auto-layout, prototyping. |

## Build & Run

```bash
# Open in Xcode
open leanring-buddy.xcodeproj

# Select the leanring-buddy scheme, set signing team, Cmd+R to build and run
# Signing: Automatic, Team: Mohamed Saleh (N7Q3VWWMAP)

# Known non-blocking warnings: Swift 6 concurrency warnings,
# deprecated onChange warning in OverlayWindow.swift. Do NOT attempt to fix these.
```

**Do NOT run `xcodebuild` from the terminal** — it invalidates TCC (Transparency, Consent, and Control) permissions and the app will need to re-request screen recording, accessibility, etc.

**Important:** This project requires `import Combine` explicitly in any file using `@Published` because `SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY = YES` enforces strict module imports.

### Rust Core Validation

```bash
source "$HOME/.cargo/env"
cargo check
cargo test
cargo build -p skilly-core-ffi
cargo run -p skilly-linux-shell -- --smoke
cargo run -p skilly-windows-shell -- --smoke
```

Generated bridge library:
- `target/debug/libskilly_core_ffi.dylib`

Optional Xcode scheme env var to force dylib path:
- `SKILLY_RUST_POLICY_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`
- `SKILLY_RUST_SKILLS_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`
- `SKILLY_RUST_CORE_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`
- `SKILLY_RUST_REALTIME_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`

## Cloudflare Worker

```bash
cd worker
npm install

# Add secrets (use --name skilly-proxy if running from outside worker/)
npx wrangler secret put OPENAI_API_KEY --name skilly-proxy
npx wrangler secret put WORKOS_API_KEY --name skilly-proxy
npx wrangler secret put SESSION_TOKEN_SECRET --name skilly-proxy

# Legacy secrets (unused by current pipeline but required for worker compatibility)
npx wrangler secret put ANTHROPIC_API_KEY --name skilly-proxy
npx wrangler secret put ASSEMBLYAI_API_KEY --name skilly-proxy
npx wrangler secret put ELEVENLABS_API_KEY --name skilly-proxy

# Deploy
npx wrangler deploy

# Local dev (create worker/.dev.vars with your keys)
npx wrangler dev
```

Worker is deployed at: `https://skilly-proxy.eng-mohamedszaied.workers.dev`

## Installing a Skill

All 5 skills are bundled with the app and seeded to `~/.skilly/skills/` on first launch by `SkillStore`. To install an additional skill manually:

```bash
# Copy skill directory to ~/.skilly/skills/
mkdir -p ~/.skilly/skills
cp -r skills/blender-fundamentals ~/.skilly/skills/

# The app scans ~/.skilly/skills/ on launch
# Each subdirectory must contain a SKILL.md file
```

Users can also drop a skill folder onto the panel via `PanelBodyView` (Finder drag-and-drop), or remove installed skills via the per-row `SkillRowActionMenu`.

## Code Style & Conventions

### Variable and Method Naming

IMPORTANT: Follow these naming rules strictly. Clarity is the top priority.

- Be as clear and specific with variable and method names as possible
- **Optimize for clarity over concision.** A developer with zero context on the codebase should immediately understand what a variable or method does just from reading its name
- Use longer names when it improves clarity. Do NOT use single-character variable names
- Example: use `originalQuestionLastAnsweredDate` instead of `originalAnswered`
- When passing props or arguments to functions, keep the same names as the original variable. Do not shorten or abbreviate parameter names. If you have `currentCardData`, pass it as `currentCardData`, not `card` or `cardData`

### Code Clarity

- **Clear is better than clever.** Do not write functionality in fewer lines if it makes the code harder to understand
- Write more lines of code if additional lines improve readability and comprehension
- Make things so clear that someone with zero context would completely understand the variable names, method names, what things do, and why they exist
- When a variable or method name alone cannot fully explain something, add a comment explaining what is happening and why

### Swift/SwiftUI Conventions

- Use SwiftUI for all UI unless a feature is only supported in AppKit (e.g., `NSPanel` for floating windows)
- All UI state updates must be on `@MainActor`
- Use async/await for all asynchronous operations
- Always add `import Combine` explicitly when using `@Published` (strict member import visibility is enabled)
- Comments should explain "why" not just "what", especially for non-obvious AppKit bridging
- AppKit `NSPanel`/`NSWindow` bridged into SwiftUI via `NSHostingView`
- All buttons must show a pointer cursor on hover
- For any interactive element, explicitly think through its hover behavior (cursor, visual feedback, and whether hover should communicate clickability)
- All Skilly additions marked with `// MARK: - Skilly` for merge hygiene

### Do NOT

- Do not add features, refactor code, or make "improvements" beyond what was asked
- Do not add docstrings, comments, or type annotations to code you did not change
- Do not try to fix the known non-blocking warnings (Swift 6 concurrency, deprecated onChange)
- Do not rename the project directory or scheme (the "leanring" typo is intentional/legacy)
- Do not run `xcodebuild` from the terminal — it invalidates TCC permissions
- Do not commit API keys, secrets, or credentials — all secrets live on the Worker as Cloudflare secrets

## Git Workflow

- Branch naming: `feature/description` or `fix/description`
- Commit messages: imperative mood, concise, explain the "why" not the "what"
- Do not force-push to main
- All Skilly changes to existing files are additive and marked with `// MARK: - Skilly`

## Fork Compatibility

This is a fork of [farzaa/clicky](https://github.com/farzaa/clicky). To merge upstream changes:

```bash
git remote add upstream https://github.com/farzaa/clicky.git
git fetch upstream
git merge upstream/main
# Resolve conflicts — Skilly changes are marked with // MARK: - Skilly
```

Modified upstream files (4): `leanring_buddyApp.swift`, `CompanionManager.swift`, `MenuBarPanelManager.swift`, `CompanionPanelView.swift`. All changes are additive.

Skilly-only files (not in upstream, safe to ignore during merges): everything in the Auth & Analytics, Billing & Entitlements, and Skill System tables above, plus `RealtimeTelemetry.swift`, `RealtimePricing.swift`, `PanelBodyView.swift`, `SettingsView.swift`, `SkillyNotificationManager.swift`, `AppSettings.swift`, `AppBundleConfiguration.swift`, `AppDetectionMonitor.swift`, `BuddyPushToTalkShortcut.swift`, the `worker/` directory, the `skills/` directory, the `core/` Rust workspace, `docs/`, and `fastlane/`.

## Self-Update Instructions

When you make changes to this project that affect the information in this file, update this file to reflect those changes. Specifically:

1. **New files**: Add new source files to the "Key Files" table with their purpose and approximate line count
2. **Deleted files**: Remove entries for files that no longer exist
3. **Architecture changes**: Update the architecture section if you introduce new patterns, frameworks, or significant structural changes
4. **Build changes**: Update build commands if the build process changes
5. **New conventions**: If the user establishes a new coding convention during a session, add it to the appropriate conventions section
6. **Line count drift**: If a file's line count changes significantly (>50 lines), update the approximate count in the Key Files table

Do NOT update this file for minor edits, bug fixes, or changes that don't affect the documented architecture or conventions.
