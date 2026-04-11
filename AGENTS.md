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

### API Proxy (Cloudflare Worker)

The app never calls external APIs directly. All requests go through a Cloudflare Worker (`worker/src/index.ts`) deployed at `skilly-proxy.eng-mohamedszaied.workers.dev`.

| Route | Method | Upstream | Purpose |
|-------|--------|----------|---------|
| `/openai/token` | GET | — | Returns OpenAI API key for Realtime WebSocket auth |
| `/auth/url` | GET | — | Returns WorkOS AuthKit authorization URL |
| `/auth/callback` | GET | — | Catches WorkOS redirect, redirects to `skilly://auth/callback` |
| `/auth/token` | POST | `api.workos.com/user_management/authenticate` | Exchanges auth code for user profile + tokens |
| `/chat` | POST | `api.anthropic.com/v1/messages` | Claude Messages API (legacy, unused by current pipeline) |
| `/tts` | POST | `api.elevenlabs.io/v1/text-to-speech/{voiceId}` | ElevenLabs TTS (legacy, unused by current pipeline) |
| `/transcribe-token` | POST | `streaming.assemblyai.com/v3/token` | AssemblyAI token (legacy, unused by current pipeline) |

Worker secrets: `OPENAI_API_KEY`, `WORKOS_API_KEY`
Worker vars: `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`
Legacy secrets (unused by current pipeline): `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

### Key Architecture Decisions

**Menu Bar Panel Pattern**: The companion panel uses `NSStatusItem` for the menu bar icon and a custom borderless `NSPanel` for the floating control panel. This gives full control over appearance (dark, rounded corners, custom shadow) and avoids the standard macOS menu/popover chrome. The panel is non-activating so it doesn't steal focus. A global event monitor auto-dismisses it on outside clicks.

**Cursor Overlay**: A full-screen transparent `NSWindow` hosts the blue cursor companion. It's non-activating, joins all Spaces, and never steals focus. The cursor position, response text, waveform, and pointing animations all render in this overlay via SwiftUI through `NSHostingView`.

**Global Push-To-Talk Shortcut**: Background push-to-talk uses a listen-only `CGEvent` tap instead of an AppKit global monitor so modifier-based shortcuts like `ctrl + option` are detected more reliably while the app is running in the background.

**OpenAI Realtime Pipeline**: A single WebSocket connection to OpenAI handles the entire voice interaction: audio in (PCM16 mono 16kHz via `appendAudioChunk()`), screenshots (JPEG via `sendScreenshot()`), transcription, vision, LLM response, and TTS audio out (PCM16 24kHz via `response.audio.delta`). This replaces the previous chained pipeline of AssemblyAI + Claude + ElevenLabs.

**Token Relay**: OpenAI API key lives as a Worker secret. The app fetches it via `GET /openai/token` at session start, enabling direct WebSocket connection to `api.openai.com/v1/realtime`.

**Transient Cursor Mode**: When "Show Skilly" is off, pressing the hotkey fades in the cursor overlay for the duration of the interaction (recording → response → TTS → optional pointing), then fades it out automatically after 1 second of inactivity.

**Skill Prompt Composition**: When a skill is active, the system prompt is composed in 5 layers: base Skilly prompt → teaching instructions → curriculum context → UI vocabulary (budget-trimmed) → pointing mode instruction. When no skill is active, the original base prompt is used unchanged.

**WorkOS Auth Flow**: User clicks "Sign in" → browser opens to WorkOS AuthKit → authenticates → WorkOS redirects to Worker `/auth/callback` → Worker serves HTML that redirects to `skilly://auth/callback?code=XXX` → app catches deep link → exchanges code for user profile via Worker `/auth/token` → stores session in Keychain.

## Key Files

### Core App (leanring-buddy/)

| File | Lines | Purpose |
|------|-------|---------|
| `leanring_buddyApp.swift` | ~150 | Menu bar app entry point. `@main` struct with `CompanionAppDelegate`. Creates singletons: `CompanionManager`, `SkillManager`, `AuthManager`. Registers `skilly://` URL scheme handler for auth callbacks. |
| `CompanionManager.swift` | ~1250 | Central state machine. Owns OpenAI Realtime client, overlay manager, audio player, screen capture, skill manager. Push-to-talk flow: hotkey press → capture screens + start audio tap → send to OpenAI → commit on release → parse `[POINT]` tags → animate cursor. |
| `MenuBarPanelManager.swift` | ~260 | NSStatusItem + custom `NSPanel` lifecycle. Creates panel, hosts `CompanionPanelView` via `NSHostingView`, handles click-outside dismissal with 0.3s delay for permission dialogs. |
| `CompanionPanelView.swift` | ~800 | SwiftUI panel content. VStack: header, permissions, model picker, skill section, footer. WorkOS sign-in/sign-out flow, settings gear popover. |
| `OverlayWindow.swift` | ~970 | Full-screen transparent overlay per screen. `BlueCursorView` with cursor states (triangle/waveform/spinner), 60fps mouse tracking, bezier arc flight animation, navigation bubble with character-by-character streaming text. |
| `CompanionResponseOverlay.swift` | ~220 | Floating response text panel that follows cursor. NSPanel-based, auto-repositions near cursor, clamps to visible screen bounds, auto-hides after 6s. |
| `CompanionScreenCaptureUtility.swift` | ~130 | Multi-monitor screenshot via ScreenCaptureKit. Filters out own app's windows, sorts displays by cursor position, returns AppKit coordinates. |
| `OpenAIRealtimeClient.swift` | ~560 | OpenAI Realtime WebSocket client. Connects to `wss://api.openai.com/v1/realtime`. Handles audio in/out, screenshots, session pre-warm. Events published via `PassthroughSubject`. |
| `RealtimeAudioPlayer.swift` | ~115 | PCM16 24kHz audio playback via `AVAudioEngine` + `AVAudioPlayerNode`. Converts Int16 → Float32 normalized to [-1, 1]. |
| `GlobalPushToTalkShortcutMonitor.swift` | ~135 | System-wide push-to-talk via listen-only `CGEvent` tap. Publishes `.pressed` / `.released` events. |
| `DesignSystem.swift` | ~870 | Design tokens. `DS.Colors`, `DS.CornerRadius`, `DS.Spacing`, button styles (primary/secondary/tertiary/text/outlined/destructive/icon), animation durations, pointer cursor system. |
| `WindowPositionManager.swift` | ~260 | Permission checks (`AXIsProcessTrusted`, `CGPreflightScreenCaptureAccess`). Window shrinking via Accessibility API. Screen recording permission fallback via UserDefaults. |
| `AppSettings.swift` | ~85 | UserDefaults-backed settings: worker base URL, voice name, transient cursor mode, analytics opt-out. |
| `AppBundleConfiguration.swift` | ~30 | Runtime config reader for Info.plist keys (bundle ID, version, name). |
| `AppDetectionMonitor.swift` | ~65 | `NSWorkspace` frontmost app bundle ID monitoring for auto-activating skills. |
| `BuddyPushToTalkShortcut.swift` | ~60 | Thin wrapper wrapping the hotkey monitor, exposing `control + option` as the default shortcut. |

### Auth & Analytics

| File | Lines | Purpose |
|------|-------|---------|
| `AuthManager.swift` | ~210 | WorkOS AuthKit flow: browser sign-in via `/auth/url`, deep link callback `skilly://auth/callback`, code exchange via `/auth/token`, Keychain storage with `ThisDeviceOnly` accessibility, refresh token support. |
| `SkillyAnalytics.swift` | ~125 | PostHog analytics. Privacy-first: no transcript/response text captured, only character counts and element labels. Gated by `analyticsEnabled` setting. |

### Skill System

| File | Lines | Purpose |
|------|-------|---------|
| `SkillManager.swift` | ~290 | Central skill coordinator. Loads skills from `~/.skilly/`, manages activation/deactivation/pause, wires `CurriculumEngine` into voice pipeline, exposes `composedSystemPrompt` consumed by `CompanionManager`. |
| `SkillStore.swift` | ~160 | Disk persistence for `~/.skilly/`. Loads skills from subdirectories, saves/loads progress JSON and config JSON, seeds bundled skills from app bundle. |
| `SkillDefinition.swift` | ~220 | SKILL.md parser. Line-by-line state machine: YAML frontmatter → `SkillMetadata`, splits markdown body by H2/H3 headings into sections. |
| `SkillMetadata.swift` | ~315 | YAML frontmatter data model. Parses flat key-value pairs and block sequences, validates skill ID format, resolves `bundleId` from known mappings, defaults `pointing_mode` to `.always`. |
| `CurriculumStage.swift` | ~245 | Parses H3 stage blocks (`### Stage N: Name`). Extracts description, goals, completion signals, prerequisites, next stage name, generates URL-safe stage ID. |
| `VocabularyEntry.swift` | ~90 | Parses H3 vocabulary blocks (`### Element Name` + description paragraphs). Joins lines with spaces, paragraphs with `\n\n`. |
| `SkillValidation.swift` | ~155 | Safety scanner: banned phrase list (prompt injection, data exfiltration), URL detection, homoglyph normalization, size limits (4K teaching tokens, 10K total), min 3-char completion signals. |
| `SkillProgress.swift` | ~105 | Per-skill progress tracker. `signalBuffer` for curriculum advancement, manual override flag, total interactions, version migration by stage position. |
| `PromptBudget.swift` | ~85 | 6K token ceiling with progressive vocabulary trimming: all → stage-relevant → top-5 → omit. |
| `CurriculumEngine.swift` | ~185 | Pure function engine. Detects completion signals (keyword match) in transcript+response, accumulates in `signalBuffer`, auto-advances after 3 signals, supports manual stage set/complete/reset. |
| `SkillPromptComposer.swift` | ~190 | 5-layer prompt composition with caching by `skillId:stageId`. Layers: base → teaching → curriculum → vocabulary (budget-trimmed) → pointing mode. |
| `SkillPanelSection.swift` | ~375 | SwiftUI skill controls in panel: active/paused/empty states, progress bar, stage list, activate/pause/reset buttons. |

### Cloudflare Worker

| File | Lines | Purpose |
|------|-------|---------|
| `worker/src/index.ts` | ~391 | Worker proxy. Routes: `/openai/token` (active), `/auth/url`, `/auth/callback`, `/auth/token` (active), `/chat`, `/tts`, `/transcribe-token` (legacy). All API keys stored as secrets. |

### Skill Files

| File | Purpose |
|------|---------|
| `skills/blender-fundamentals/SKILL.md` | Blender Fundamentals skill — 6 curriculum stages (navigation → first render), 10 UI vocabulary entries, teaching instructions with common beginner mistakes, `pointing_mode: always`. |

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

## Cloudflare Worker

```bash
cd worker
npm install

# Add secrets (use --name skilly-proxy if running from outside worker/)
npx wrangler secret put OPENAI_API_KEY --name skilly-proxy
npx wrangler secret put WORKOS_API_KEY --name skilly-proxy

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

```bash
# Copy skill directory to ~/.skilly/skills/
mkdir -p ~/.skilly/skills
cp -r skills/blender-fundamentals ~/.skilly/skills/

# The app scans ~/.skilly/skills/ on launch
# Each subdirectory must contain a SKILL.md file
```

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

## Self-Update Instructions

When you make changes to this project that affect the information in this file, update this file to reflect those changes. Specifically:

1. **New files**: Add new source files to the "Key Files" table with their purpose and approximate line count
2. **Deleted files**: Remove entries for files that no longer exist
3. **Architecture changes**: Update the architecture section if you introduce new patterns, frameworks, or significant structural changes
4. **Build changes**: Update build commands if the build process changes
5. **New conventions**: If the user establishes a new coding convention during a session, add it to the appropriate conventions section
6. **Line count drift**: If a file's line count changes significantly (>50 lines), update the approximate count in the Key Files table

Do NOT update this file for minor edits, bug fixes, or changes that don't affect the documented architecture or conventions.
