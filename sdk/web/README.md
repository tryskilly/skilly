# @skilly/web

Embeddable Skilly companion for websites — guided onboarding + live support that
sees the page, points at UI elements, and talks the user through it. Site owners
install it on their own web app; their visitors get the companion. See
`docs/architecture/web-sdk-prd.md`.

This package consumes the shared Rust core compiled to WASM (`core/web-sdk`,
output in `sdk/web/generated/`).

## Status — live embed

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
- **Visitor continuity**: typed questions, final voice transcripts, and streamed
  Skilly answers are kept as text-only session history. The history is bounded,
  clearable, and stored in `sessionStorage`, so it survives closing/reopening the
  widget and a same-tab reload but is not shared across tabs or sent to analytics.
- **Honest guided progress**: the Realtime model can call
  `update_guidance_progress` with a stable two-to-six-step plan. The widget shows
  every step as complete/current/upcoming and does not infer progress from message
  count. One-off answers do not show a progress card.

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

## Visitor history and progress behavior

- The conversation panel opens above the bottom-right launcher. Visitors can
  drag its header elsewhere; only the panel coordinates are retained locally.
- The pointer remains independent of the panel. While Skilly points and speaks,
  a compact caption follows the pointer and stays inside the viewport.
- The session-history button appears after the first user or assistant message.
- History opens automatically on wider screens and stays collapsed by default
  on narrow screens so it does not cover the page or the pointer caption.
- The panel remains available when a turn ends so the last answer does not disappear.
- **Clear** removes both the current-tab transcript and its guided-task progress.
- Only text is retained. Microphone audio, generated audio, page digests, and UI
  action payloads are not written to session history.
- Progress is model-authored through a validated tool payload. `current_step` is
  one-based, `steps` must contain two to six non-empty labels, and `status` must
  be `in_progress` or `completed`.
- The prompt requires confirmation or observation before advancing a step and
  forbids claiming completion without evidence.

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
