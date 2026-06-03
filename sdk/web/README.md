# @skilly/web

Embeddable Skilly companion for websites — guided onboarding + live support that
sees the page, points at UI elements, and talks the user through it. Site owners
install it on their own web app; their visitors get the companion. See
`docs/architecture/web-sdk-prd.md`.

This package consumes the shared Rust core compiled to WASM (`core/web-sdk`,
output in `sdk/web/generated/`).

## Status — Phases 8.1 → 8.3

What's here:
- **8.1** `@skilly/web` package: Shadow-DOM widget (launcher, response bubble,
  blue cursor), the public `Skilly` API, and the lazy WASM-core loader.
- **8.2** **DOM digest** (`getPageDigest()`) + the **selector-based pointing
  engine**: `[POINT:id:label]` → resolve (digest id / `data-skilly` / CSS /
  visible text) → **bezier-arc cursor flight** → re-anchor on scroll/resize.
- **8.3** **Voice pipeline**: when `backendUrl` is set, the launcher opens a
  continuous OpenAI **Realtime session over WebRTC** — token from the backend
  (`token.ts`), companion instructions composed from the SKILL.md + DOM digest
  (`prompt.ts`), mic up / model voice down (`realtime.ts`), and the model's
  `[POINT]` tags fed straight into the pointing engine. Without `backendUrl` the
  widget falls back to a simulated turn lifecycle (so the demo runs key-free).

Layered on next: **8.5** site-owner dashboard · **8.6** Polar billing +
session-seconds metering.

> The live WebRTC↔OpenAI audio loop needs a real `OPENAI_API_KEY` in the backend
> + a mic, so it's validated by build + a live session, not headless tests. The
> token-fetch + error-handling seam IS validated end-to-end against the backend
> (`demo/index.html?backend=http://localhost:4310`).

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
