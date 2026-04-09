# Skilly - Agent Instructions

## Overview

Skilly (tryskilly.app) is a macOS menu bar AI teaching companion that sees the user's screen, speaks to them, and physically points at UI elements — powered by domain-specific teaching skills. Built as a fork of [Clicky by Farza](https://github.com/farzaa/clicky) (MIT License).

Lives entirely in the macOS status bar (no dock icon, no main window). Clicking the menu bar icon opens a custom floating panel with companion voice controls. Uses push-to-talk (ctrl+option) to capture voice input, transcribes it via AssemblyAI streaming, and sends the transcript + a screenshot of the user's screen to Claude. Claude responds with text (streamed via SSE) and voice (ElevenLabs TTS). A blue cursor overlay can fly to and point at UI elements Claude references on any connected monitor.

When a teaching skill is active (e.g., Blender Fundamentals), the companion's system prompt is layered with domain expertise, curriculum context, and UI vocabulary — turning generic AI assistance into expert tutoring.

All API keys live on a Cloudflare Worker proxy — nothing sensitive ships in the app.

## Architecture

- **App Type**: Menu bar-only (`LSUIElement=true`), no dock icon or main window
- **Bundle ID**: `app.tryskilly.skilly`
- **Framework**: SwiftUI (macOS native) with AppKit bridging for menu bar panel and cursor overlay
- **Pattern**: MVVM with `@StateObject` / `@Published` state management
- **AI Chat**: Claude (Sonnet 4.6 default, Opus 4.6 optional) via Cloudflare Worker proxy with SSE streaming
- **Speech-to-Text**: AssemblyAI real-time streaming (`u3-rt-pro` model) via websocket, with OpenAI and Apple Speech as fallbacks
- **Text-to-Speech**: ElevenLabs (`eleven_flash_v2_5` model) via Cloudflare Worker proxy
- **Screen Capture**: ScreenCaptureKit (macOS 14.2+), multi-monitor support
- **Voice Input**: Push-to-talk via `AVAudioEngine` + pluggable transcription-provider layer. System-wide keyboard shortcut via listen-only CGEvent tap.
- **Element Pointing**: Claude embeds `[POINT:x,y:label:screenN]` tags in responses. The overlay parses these, maps coordinates to the correct monitor, and animates the blue cursor along a bezier arc to the target. Edge-proximity check suppresses animation when coordinates are within 5% of any screen edge.
- **Auth**: WorkOS AuthKit via browser → `skilly://auth/callback` deep link → Keychain session storage
- **Skill System**: SKILL.md files parsed at runtime, layered into system prompt with curriculum tracking
- **Concurrency**: `@MainActor` isolation, async/await throughout
- **Analytics**: PostHog via `ClickyAnalytics.swift` (own project, not upstream)

### API Proxy (Cloudflare Worker)

The app never calls external APIs directly. All requests go through a Cloudflare Worker (`worker/src/index.ts`) deployed at `skilly-proxy.eng-mohamedszaied.workers.dev`.

| Route | Method | Upstream | Purpose |
|-------|--------|----------|---------|
| `/chat` | POST | `api.anthropic.com/v1/messages` | Claude vision + streaming chat |
| `/tts` | POST | `api.elevenlabs.io/v1/text-to-speech/{voiceId}` | ElevenLabs TTS audio |
| `/transcribe-token` | POST | `streaming.assemblyai.com/v3/token` | Fetches a short-lived (480s) AssemblyAI websocket token |
| `/auth/url` | GET | — | Returns WorkOS AuthKit authorization URL |
| `/auth/callback` | GET | — | Catches WorkOS redirect, redirects to `skilly://auth/callback` |
| `/auth/token` | POST | `api.workos.com/user_management/authenticate` | Exchanges auth code for user profile + tokens |

Worker secrets: `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`, `WORKOS_API_KEY`
Worker vars: `ELEVENLABS_VOICE_ID`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`

### Key Architecture Decisions

**Menu Bar Panel Pattern**: The companion panel uses `NSStatusItem` for the menu bar icon and a custom borderless `NSPanel` for the floating control panel. This gives full control over appearance (dark, rounded corners, custom shadow) and avoids the standard macOS menu/popover chrome. The panel is non-activating so it doesn't steal focus. A global event monitor auto-dismisses it on outside clicks.

**Cursor Overlay**: A full-screen transparent `NSPanel` hosts the blue cursor companion. It's non-activating, joins all Spaces, and never steals focus. The cursor position, response text, waveform, and pointing animations all render in this overlay via SwiftUI through `NSHostingView`.

**Global Push-To-Talk Shortcut**: Background push-to-talk uses a listen-only `CGEvent` tap instead of an AppKit global monitor so modifier-based shortcuts like `ctrl + option` are detected more reliably while the app is running in the background.

**Shared URLSession for AssemblyAI**: A single long-lived `URLSession` is shared across all AssemblyAI streaming sessions (owned by the provider, not the session). Creating and invalidating a URLSession per session corrupts the OS connection pool and causes "Socket is not connected" errors after a few rapid reconnections.

**Transient Cursor Mode**: When "Show Skilly" is off, pressing the hotkey fades in the cursor overlay for the duration of the interaction (recording → response → TTS → optional pointing), then fades it out automatically after 1 second of inactivity.

**Skill Prompt Composition**: When a skill is active, the system prompt is composed in 5 layers: base Skilly prompt → teaching instructions → curriculum context → UI vocabulary (budget-trimmed) → pointing mode instruction. When no skill is active, the original base prompt is used unchanged.

**WorkOS Auth Flow**: User clicks "Sign in" → browser opens to WorkOS AuthKit → authenticates → WorkOS redirects to Worker `/auth/callback` → Worker serves HTML that redirects to `skilly://auth/callback?code=XXX` → app catches deep link → exchanges code for user profile via Worker `/auth/token` → stores session in Keychain.

## Key Files

### Inherited from Clicky (modified minimally)

| File | Lines | Purpose |
|------|-------|---------|
| `leanring_buddyApp.swift` | ~110 | Menu bar app entry point. `CompanionAppDelegate` owns `CompanionManager`, `SkillManager`, and `AuthManager` singletons. Registers `skilly://` URL scheme handler for auth callbacks. |
| `CompanionManager.swift` | ~1100 | Central state machine. Owns dictation, shortcut monitoring, screen capture, Claude API, ElevenLabs TTS, and overlay management. Modified: accepts `SkillManager` via setter, uses `composedSystemPrompt` instead of static prompt, post-response curriculum signal hook, edge-proximity pointing check. |
| `MenuBarPanelManager.swift` | ~250 | NSStatusItem + custom NSPanel lifecycle. Modified: passes `SkillManager` and `AuthManager` through to `CompanionPanelView`. |
| `CompanionPanelView.swift` | ~800 | SwiftUI panel content. Modified: WorkOS sign-in button replaces email form, `SkillPanelSection` rendered below model picker, sign-out in footer, replay intro button. |
| `OverlayWindow.swift` | ~881 | Full-screen transparent overlay hosting the blue cursor, response text, waveform, and spinner. |
| `CompanionResponseOverlay.swift` | ~217 | SwiftUI view for the response text bubble and waveform. |
| `CompanionScreenCaptureUtility.swift` | ~132 | Multi-monitor screenshot capture using ScreenCaptureKit. |
| `BuddyDictationManager.swift` | ~866 | Push-to-talk voice pipeline with provider-aware permission checks. |
| `BuddyTranscriptionProvider.swift` | ~100 | Protocol surface and provider factory for voice transcription backends. |
| `AssemblyAIStreamingTranscriptionProvider.swift` | ~478 | Streaming transcription via AssemblyAI v3 websocket. |
| `OpenAIAudioTranscriptionProvider.swift` | ~317 | Upload-based transcription provider. |
| `AppleSpeechTranscriptionProvider.swift` | ~147 | Local fallback transcription provider. |
| `BuddyAudioConversionSupport.swift` | ~108 | Audio conversion helpers (PCM16, WAV). |
| `GlobalPushToTalkShortcutMonitor.swift` | ~132 | System-wide push-to-talk via CGEvent tap. |
| `ClaudeAPI.swift` | ~291 | Claude vision API client with SSE streaming. |
| `OpenAIAPI.swift` | ~142 | OpenAI GPT vision API client. |
| `ElevenLabsTTSClient.swift` | ~81 | ElevenLabs TTS client. |
| `DesignSystem.swift` | ~880 | Design system tokens. All UI references `DS.Colors`, `DS.CornerRadius`, etc. |
| `ClickyAnalytics.swift` | ~121 | PostHog analytics (using Skilly's own project key). |
| `WindowPositionManager.swift` | ~262 | Window placement and permission flow helpers. |
| `AppBundleConfiguration.swift` | ~28 | Runtime configuration reader for Info.plist keys. |

### Skilly Additions (all new files)

| File | Lines | Purpose |
|------|-------|---------|
| `AuthManager.swift` | ~200 | WorkOS AuthKit flow: browser sign-in, deep link callback, code exchange, Keychain session storage. |
| `SkillManager.swift` | ~280 | Central skill coordinator. Loads skills from disk, manages activation/deactivation/pause, composes system prompts, processes curriculum interactions. App-delegate-level singleton. |
| `SkillDefinition.swift` | ~210 | Full SKILL.md parser. Line-by-line state machine: YAML frontmatter → H2 section splitting → H3 curriculum/vocabulary extraction. |
| `SkillMetadata.swift` | ~310 | YAML frontmatter data model + flat key-value parser with array support. |
| `CurriculumStage.swift` | ~240 | Curriculum stage model. Parses stage blocks with goals, completion signals, prerequisites, next-stage links. |
| `VocabularyEntry.swift` | ~90 | UI vocabulary entry model. Canonical element names + descriptions for prompt injection. |
| `SkillValidation.swift` | ~150 | Safety validation: banned pattern scanning (prompt injection, data exfiltration), URL detection, size limits (4K tokens teaching, 10K total). |
| `SkillProgress.swift` | ~100 | Per-skill progress model. Signal buffer for curriculum advancement, manual override flag, version migration. |
| `PromptBudget.swift` | ~80 | Token budget guard (6K ceiling). Progressive vocabulary trimming: all → stage-relevant → top-5 → omit. |
| `CurriculumEngine.swift` | ~180 | Signal detection (keyword matching in transcripts), 3-interaction threshold advancement, manual controls (set stage, mark complete, reset). |
| `SkillPromptComposer.swift` | ~185 | 5-layer prompt composition with caching. Base → teaching → curriculum → vocabulary → pointing mode. |
| `SkillStore.swift` | ~155 | Disk persistence for `~/.skillsight/` directory: skill loading, progress JSON, config. |
| `SkillPanelSection.swift` | ~370 | SwiftUI view for skill controls in the panel: active/paused/empty states, progress bar, stage list, reset. |
| `worker/src/index.ts` | ~260 | Cloudflare Worker proxy. Six routes: `/chat`, `/tts`, `/transcribe-token`, `/auth/url`, `/auth/callback`, `/auth/token`. |

### Skill Files

| File | Purpose |
|------|---------|
| `skills/blender-fundamentals/SKILL.md` | Blender Fundamentals skill — 6 curriculum stages (navigation → first render), 10 UI vocabulary entries, teaching instructions with common beginner mistakes. |

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `SkillDefinitionTests.swift` | ~19 | YAML parsing, H2/H3 extraction, curriculum stages, vocabulary, Blender skill validation |
| `SkillValidationTests.swift` | 10 | Banned patterns, URL detection, size limits |
| `SkillProgressTests.swift` | 6 | Serialization, version migration |
| `PromptBudgetTests.swift` | 6 | Budget enforcement, progressive trimming |
| `CurriculumEngineTests.swift` | 12 | Signal detection, advancement threshold, manual overrides |
| `SkillPromptComposerTests.swift` | 8 | Layer ordering, vocabulary injection, cache invalidation |
| `SkillStoreTests.swift` | 6 | Disk persistence, skill loading |

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
npx wrangler secret put ANTHROPIC_API_KEY --name skilly-proxy
npx wrangler secret put ASSEMBLYAI_API_KEY --name skilly-proxy
npx wrangler secret put ELEVENLABS_API_KEY --name skilly-proxy
npx wrangler secret put WORKOS_API_KEY --name skilly-proxy

# Deploy
npx wrangler deploy

# Local dev (create worker/.dev.vars with your keys)
npx wrangler dev
```

Worker is deployed at: `https://skilly-proxy.eng-mohamedszaied.workers.dev`

## Installing a Skill

```bash
# Copy skill directory to ~/.skillsight/skills/
mkdir -p ~/.skillsight/skills
cp -r skills/blender-fundamentals ~/.skillsight/skills/

# The app scans ~/.skillsight/skills/ on launch
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
