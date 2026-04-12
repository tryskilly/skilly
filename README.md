# Hi, this is Clicky.
It's an AI teacher that lives as a buddy next to your cursor. It can see your screen, talk to you, and even point at stuff. Kinda like having a real teacher next to you.

Download it [here](https://www.clicky.so/) for free.

Here's the [original tweet](https://x.com/FarzaTV/status/2041314633978659092) that kinda blew up for a demo for more context.

![Clicky — an ai buddy that lives on your mac](clicky-demo.gif)

This is the open-source version of Clicky for those that want to hack on it, build their own features, or just see how it works under the hood.

## Get started with Claude Code

The fastest way to get this running is with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Once you get Claude running, paste this:

```
Hi Claude.

Clone https://github.com/farzaa/clicky.git into my current directory.

Then read the CLAUDE.md. I want to get Clicky running locally on my Mac.

Help me set up everything — the Cloudflare Worker with my own API keys, the proxy URLs, and getting it building in Xcode. Walk me through it.
```

That's it. It'll clone the repo, read the docs, and walk you through the whole setup. Once you're running you can just keep talking to it — build features, fix bugs, whatever. Go crazy.

## Manual setup

If you want to do it yourself, here's the deal.

### Prerequisites

- macOS 14.2+ (for ScreenCaptureKit)
- Xcode 15+
- Node.js 18+ (for the Cloudflare Worker)
- A [Cloudflare](https://cloudflare.com) account (free tier works)
- API keys for: [OpenAI](https://platform.openai.com) and [WorkOS](https://workos.com)

### 1. Set up the Cloudflare Worker

The Worker is a tiny proxy that holds your API keys. The app talks to the Worker, the Worker talks to the APIs. This way your keys never ship in the app binary.

```bash
cd worker
npm install
```

Now add your secrets. Wrangler will prompt you to paste each one:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WORKOS_API_KEY
npx wrangler secret put SESSION_TOKEN_SECRET
```

For the WorkOS config, open `wrangler.toml` and set it there (these are not sensitive):

```toml
[vars]
WORKOS_CLIENT_ID = "your-workos-client-id"
WORKOS_REDIRECT_URI = "https://your-worker-name.your-subdomain.workers.dev/auth/callback"
```

Deploy it:

```bash
npx wrangler deploy
```

It'll give you a URL like `https://your-worker-name.your-subdomain.workers.dev`. Copy that.

### 2. Run the Worker locally (for development)

If you want to test changes to the Worker without deploying:

```bash
cd worker
npx wrangler dev
```

This starts a local server (usually `http://localhost:8787`) that behaves exactly like the deployed Worker. You'll need to create a `.dev.vars` file in the `worker/` directory with your keys:

```
OPENAI_API_KEY=sk-...
WORKOS_API_KEY=...
WORKOS_CLIENT_ID=...
WORKOS_REDIRECT_URI=https://your-worker-name.your-subdomain.workers.dev/auth/callback
```

Then update the worker base URL in app settings (or defaults) to point to `http://localhost:8787` instead of the deployed Worker URL while developing.

### 3. Update the proxy URLs in the app

The app reads the Worker URL from settings (`workerBaseURL`). For security, point it to your own Worker deployment. Do not rely on shared/public Worker URLs for production usage.

### 4. Open in Xcode and run

```bash
open leanring-buddy.xcodeproj
```

In Xcode:
1. Select the `leanring-buddy` scheme (yes, the typo is intentional, long story)
2. Set your signing team under Signing & Capabilities
3. Hit **Cmd + R** to build and run

The app will appear in your menu bar (not the dock). Click the icon to open the panel, grant the permissions it asks for, and you're good.

### Permissions the app needs

- **Microphone** — for push-to-talk voice capture
- **Accessibility** — for the global keyboard shortcut (Control + Option)
- **Screen Recording** — for taking screenshots when you use the hotkey
- **Screen Content** — for ScreenCaptureKit access

## Architecture

If you want the full technical breakdown, read `CLAUDE.md`. But here's the short version:

**Menu bar app** (no dock icon) with two `NSPanel` windows — one for the control panel dropdown, one for the full-screen transparent cursor overlay. Push-to-talk streams audio + screenshots to **OpenAI Realtime** over WebSocket (STT + vision + LLM + audio response). The response text is shown beside the floating cursor while speaking. The model can embed `[POINT:x,y:label:screenN]` tags; Skilly parses them and animates the cursor to the referenced UI element across monitors. Cloudflare Worker still proxies auth and external API routes.

## Project structure

```
leanring-buddy/          # Swift source (yes, the typo stays)
  CompanionManager.swift    # Central state machine
  CompanionPanelView.swift  # Menu bar panel UI
  OpenAIRealtimeClient.swift # OpenAI Realtime websocket client
  AuthManager.swift          # WorkOS auth flow + keychain session
  SkillManager.swift         # Skill loading/activation/progress
  OverlayWindow.swift       # Blue cursor overlay
  CompanionScreenCaptureUtility.swift # Multi-screen capture
  GlobalPushToTalkShortcutMonitor.swift # Global hotkey capture
worker/                  # Cloudflare Worker proxy
  src/index.ts              # /openai/token, /auth/*, and legacy proxy routes
CLAUDE.md                # Full architecture doc (agents read this)
```

## Contributing

PRs welcome. If you're using Claude Code, it already knows the codebase — just tell it what you want to build and point it at `CLAUDE.md`.

Got feedback? DM me on X [@farzatv](https://x.com/farzatv).

## Security

- Vulnerability reporting process: [`SECURITY.md`](SECURITY.md)
- Third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- Privacy data inventory for release labels: [`docs/privacy-data-inventory.md`](docs/privacy-data-inventory.md)
- Latest remediation summary: [`docs/security-remediation-rvb-launch-2026-04-13.md`](docs/security-remediation-rvb-launch-2026-04-13.md)
