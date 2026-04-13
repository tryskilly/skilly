# Skilly

An AI teaching companion that lives in your macOS menu bar. It sees your screen, talks to you, and physically points at UI elements — like having an expert tutor sitting next to you.

Built for learning creative software: Figma, Blender, After Effects, and more. Each app gets a domain-specific teaching skill with curriculum stages, UI vocabulary, and expert knowledge.

**[tryskilly.app](https://tryskilly.app)** | **[Download](https://github.com/tryskilly/skilly/releases/latest/download/Skilly.dmg)**

## How it works

1. **Push to talk** (ctrl + option) or enable **Live Tutor** for always-on listening
2. Skilly captures your screen, hears your question, and responds with voice
3. A blue cursor flies to and points at the UI element it's referencing
4. Teaching skills provide structured learning with curriculum stages

The entire voice pipeline runs through a single OpenAI Realtime WebSocket — audio in, screenshots, transcription, vision, LLM response, and TTS all in one connection.

## Features

- **Screen-aware tutoring** — sees your screen and references specific UI elements
- **Cursor pointing** — blue cursor animates to elements via tool-call-based `point_at_element`
- **Teaching skills** — SKILL.md files with curriculum stages, completion signals, and UI vocabulary
- **Live Tutor mode** — always-on listening with server-side VAD (no hotkey needed)
- **Multi-monitor** — captures and points across all connected displays
- **15-minute free trial** — no card required, then $19/month for 3 hours of tutoring

## Quick start with Claude Code

```
Hi Claude.

Clone https://github.com/engmsaleh/clicky.git into my current directory.

Then read the CLAUDE.md. I want to get Skilly running locally on my Mac.

Help me set up everything — the Cloudflare Worker with my own API keys, the proxy URLs, and getting it building in Xcode. Walk me through it.
```

## Manual setup

### Prerequisites

- macOS 14.2+ (for ScreenCaptureKit)
- Xcode 15+
- Node.js 18+ (for the Cloudflare Worker)
- A [Cloudflare](https://cloudflare.com) account (free tier works)
- API keys for: [OpenAI](https://platform.openai.com) and [WorkOS](https://workos.com)

### 1. Set up the Cloudflare Worker

The Worker is a proxy that holds your API keys and handles auth, billing, and API routing. Nothing sensitive ships in the app binary.

```bash
cd worker
npm install
```

Add your secrets:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WORKOS_API_KEY
npx wrangler secret put SESSION_TOKEN_SECRET
npx wrangler secret put POLAR_API_KEY
npx wrangler secret put POLAR_WEBHOOK_SECRET
```

Configure `wrangler.toml` with your WorkOS and Polar settings, then deploy:

```bash
npx wrangler deploy
```

### 2. Open in Xcode and run

```bash
open leanring-buddy.xcodeproj
```

1. Select the `leanring-buddy` scheme (the typo is intentional/legacy)
2. Set your signing team under Signing & Capabilities
3. Hit **Cmd + R** to build and run

The app appears in your menu bar (not the dock). Click the icon to open the panel.

**Do NOT run `xcodebuild` from the terminal** — it invalidates TCC permissions and the app will need to re-request screen recording, accessibility, etc.

### Permissions

- **Microphone** — push-to-talk voice capture
- **Accessibility** — global keyboard shortcut
- **Screen Recording** — screenshots when you talk

## Architecture

Menu bar app (`LSUIElement=true`) with two `NSPanel` windows — one for the control panel dropdown, one for the full-screen transparent cursor overlay.

Push-to-talk or Live Tutor mode streams audio + screenshots to **OpenAI Realtime** over WebSocket. The model calls the `point_at_element` tool to animate the cursor to UI elements across monitors. Teaching skills layer domain expertise into the system prompt with curriculum tracking and UI vocabulary.

All API calls route through a Cloudflare Worker proxy with signed session tokens and authenticated endpoints.

For the full technical breakdown, read [`CLAUDE.md`](CLAUDE.md).

## Project structure

```
leanring-buddy/             # Swift source (the typo stays)
  CompanionManager.swift      # Central state machine + voice pipeline
  OpenAIRealtimeClient.swift  # OpenAI Realtime WebSocket client
  SkillManager.swift          # Skill loading, activation, curriculum
  SkillPromptComposer.swift   # 5-layer system prompt composition
  AuthManager.swift           # WorkOS auth + Keychain session
  EntitlementManager.swift    # Billing entitlement + trial tracking
  OverlayWindow.swift         # Blue cursor overlay + pointing animation
  PanelBodyView.swift         # Main panel with skills + plan strip
  SettingsView.swift          # Settings (Account, Voice, General)
worker/                     # Cloudflare Worker proxy
  src/index.ts                # Auth, billing, OpenAI token relay
skills/                     # Bundled teaching skills
  blender-fundamentals/       # Blender 4.x skill (6 stages)
docs/                       # Security audits, privacy inventory
```

## Installing skills

Skills are SKILL.md files that turn Skilly into a domain expert. Drop them in `~/.skilly/skills/`:

```bash
mkdir -p ~/.skilly/skills
cp -r skills/blender-fundamentals ~/.skilly/skills/
```

Skills auto-activate when you open their target app (e.g., the Blender skill activates when Blender is frontmost).

## Fork origin

This is a fork of [farzaa/clicky](https://github.com/farzaa/clicky) (MIT License). Original upstream code is attributed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Skilly-specific additions are marked with `// MARK: - Skilly` throughout the codebase.

## Security

- Vulnerability reporting: [`SECURITY.md`](SECURITY.md)
- Third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- Privacy data inventory: [`docs/privacy-data-inventory.md`](docs/privacy-data-inventory.md)

## License

Copyright 2026 Mohamed Saleh Zaied ([moelabs.dev](https://moelabs.dev))

Licensed under the Apache License, Version 2.0. See [`LICENSE`](LICENSE) for details.

Original [Clicky](https://github.com/farzaa/clicky) code by Farza, licensed under MIT.
