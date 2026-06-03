# @skilly/web

Embeddable Skilly companion for websites — guided onboarding + live support that
sees the page, points at UI elements, and talks the user through it. Site owners
install it on their own web app; their visitors get the companion. See
`docs/architecture/web-sdk-prd.md`.

This package consumes the shared Rust core compiled to WASM (`core/web-sdk`,
output in `sdk/web/generated/`).

## Status — Phases 8.1 + 8.2

What's here:
- **8.1** `@skilly/web` package: Shadow-DOM widget (launcher, response bubble,
  blue cursor), the public `Skilly` API, and the lazy WASM-core loader.
- **8.2** **DOM digest** (`getPageDigest()`) — a structured, screenshot-free view
  of the page's interactive/annotated elements with stable ids + rects — and the
  **selector-based pointing engine**: `[POINT:id:label]` → resolve (digest id /
  `data-skilly` / CSS / visible text) → **bezier-arc cursor flight** → re-anchor
  on scroll/resize.
- A simulated turn lifecycle (listening → thinking → speaking → complete) so the
  embed is demonstrable end-to-end.

Layered on next: **8.3** OpenAI Realtime voice pipeline (replaces the simulated
turn) · **8.4+** multi-tenant Next.js backend (keys, metering, SKILL.md serving).

## Install / embed

Script tag (auto-inits from `data-skilly-*`):

```html
<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="pk_live_..." data-skilly-skill="acme-onboarding" defer></script>
```

npm:

```ts
import { init, start, on } from "@skilly/web";
init({ key: "pk_live_...", skill: "acme-onboarding" });
on("complete", () => console.log("turn done"));
```

## Public API

| Call | Purpose |
|------|---------|
| `init(config)` | Mount the widget. `config`: `key` (required), `skill`, `accentColor`, `locale`, `coreUrl`, `backendUrl`. |
| `start(goal?)` | Open the companion and run a turn. |
| `on(event, cb)` | Subscribe to `turn` / `point` / `complete` / `error`. Returns an unsubscribe fn. |
| `identify(id, traits?)` | Associate the end-user (analytics — wired in 8.4+). |
| `destroy()` | Tear down the widget. |

## Develop

```bash
cd sdk/web
bun install         # or npm install
bun run typecheck   # tsc --noEmit
bun run build       # tsup → dist/ (ESM + IIFE + .d.ts)
bun run demo        # build + serve demo/ at http://localhost:4321
```

`dist/` and `node_modules/` are gitignored; `generated/` holds the wasm core
(built by `scripts/build-web-sdk.sh`).
