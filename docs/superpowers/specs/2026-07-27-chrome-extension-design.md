# Design: Skilly Browser Extension

> Status: Approved design, not yet an implementation plan. Follows
> `docs/architecture/chrome-extension-sketch.md` (the reuse-map exploration this design resolves
> into concrete decisions). Next step: `superpowers:writing-plans`.

## Summary

A user-installed browser extension that gives Skilly (see the page → point at UI → talk you
through it → optionally do the step for you) on **any site**, not just sites a tenant has
installed the web widget on. B2C, individually purchased, sharing entitlement with the Mac app
under one WorkOS identity. Ships for Chrome, Firefox, and Safari from day one via a shared
codebase (WXT).

## Decisions

These were resolved through brainstorming and are the fixed points for the implementation plan —
not open questions to revisit there.

| # | Decision | Choice |
|---|----------|--------|
| 1 | v1 scope | Point + talk + click/fill actions, all from day one (not phased) |
| 2 | Backend auth path | New, isolated `/api/extension/*` routes on Studio — not the Worker, not `/api/mac/*` directly — sharing `macSession.ts`'s underlying auth logic without sharing route/deploy risk with the in-flight Mac cutover |
| 3 | Target browsers | Chrome, Firefox, and Safari simultaneously via a cross-browser framework |
| 4 | Skill/content source | Bundled skill library auto-matched by URL, generic page-aware fallback when nothing matches, manual override always available |
| 5 | Identity & billing | One WorkOS login / one Polar subscription unlocks Mac + extension + web equally (no double billing); each surface tags its own usage events for analytics |
| 6 | Action confirmation | Confirm-by-default is loosened for ordinary actions (different trust boundary than a tenant's stranger-visitor); the destructive-keyword screen and an explicit `destructive:true` flag remain a hard, non-negotiable confirm regardless of this setting |
| 7 | Code-sharing strategy | Extract a new `sdk/browser-core` package from `@skilly/web`'s reusable modules; both the widget and the extension consume it. Framework: **WXT** (Vite-based, framework-agnostic — matches `sdk/web`'s existing vanilla-TS-no-framework philosophy; Plasmo was rejected for leaning React-first) |

## Architecture

Manifest V3 background service workers can be terminated by the browser at any time and have no
DOM access (`getUserMedia`/WebRTC don't work there). The Realtime voice session therefore cannot
live in the background worker — it lives in a **chrome.offscreen document**, a hidden persistent
DOM context Chrome provides for exactly this class of problem (audio/video/WebRTC that must
outlive the ephemeral background worker).

```
Content script (one per frame, incl. cross-origin iframes via all_frames: true)
  digest.ts / pointing.ts / actions.ts / widget.ts (split — see Components)
        │ chrome.runtime messaging
        ▼
Background service worker (coordinator only — not a media host)
  routes frame-tagged messages, owns auth/entitlement state,
  talks to /api/extension/*, creates the offscreen document on session start
        │
        ▼
Offscreen document (hidden, persists for the session's lifetime)
  realtime.ts (WebRTC + mic) / core.ts (wasm) / prompt.ts
```

`sdk/browser-core` supplies `digest.ts`/`pointing.ts`/`actions.ts`/`widget.ts` to the
content-script bundle and `realtime.ts`/`prompt.ts`/`core.ts` to the offscreen-document bundle —
one package, two WXT entry points consuming different subsets.

## Components

**Popup**: sign-in (WorkOS, shared identity), entitlement status, active-skill display with a
dropdown to override auto-detection (bundled skills + "Generic"), on/off toggle for the current
tab. No separate options page in v1 — there is no per-user configurable setting yet (confirm
policy is a fixed default, decision 6).

**Skill selection**: on tab load, the background worker matches the active tab's hostname against
a bundled skill → URL-pattern map (extends the existing `SkillMetadata` shape, keyed by domain
instead of an installed folder) and auto-activates a match; falls back to a generic page-aware
prompt otherwise. A popup override always takes precedence over auto-detection.

**Multi-frame digest** (the capability the web widget structurally cannot offer): each frame's
content script computes its own local digest and registers with the background worker tagged by
frame ID, including cross-origin iframes. The offscreen document merges all currently-registered
frames' digests (tagged by origin) before calling `composePrompt`. A `[POINT]`/`perform_action`
directive carries a frame ID; the background worker routes it to that specific content-script
instance. This coordination layer has no `sdk/web` precedent — it is the one genuinely new piece
of core logic in this project, everything else is either reuse or a thin platform shell.

**Widget UI is split across frames, not top-frame-only.** A top frame cannot draw over an
iframe's pixels — browsers block cross-frame overlay by design (it's the same protection that
prevents clickjacking) — so pointing *into* an iframe requires that iframe's own content script
to render its own cursor/confirm-chip. Concretely: every frame gets a **minimal** `widget.ts`
instance (cursor + confirm chip only), positioned with `position: fixed` inside that frame's own
document — which is sufficient, since a fixed-position element inside an iframe already renders
at the iframe's correct on-screen location without any cross-frame coordinate math. The
**launcher button, response bubble, and mic control** — the one coherent control surface for the
whole tab — mount in the top frame only.

## Backend: `/api/extension/*` on Studio

Routes: `POST /api/extension/token` (ephemeral OpenAI Realtime secret), `GET
/api/extension/entitlement`, `POST /api/extension/usage` — separate route files from `/api/mac/*`
(blast-radius isolation from the Mac cutover) but calling the same underlying `macSession.ts`
session-verification helpers (no duplicated auth logic).

**Auth**: `chrome.identity.launchWebAuthFlow` opens Studio's existing WorkOS login page; the
redirect lands on the extension's standard `https://<extension-id>.chromiumapp.org/...` callback
URL. No new backend auth flow — just a new registered redirect URI.

**Entitlement**: no new policy logic. `canStartTurn` already exists in `core/policy`, is already
wasm-compiled for the web target, and is the same Rust source Mac's `TrialTracker`/`UsageTracker`
wrap — the route calls the same shared function Mac's backend path calls.

**Usage**: same `usage_events` table, tagged `source_surface: "extension"` (matching the existing
tagging convention) — one entitlement decision, per-surface visibility, no double billing.

## Data flow & error handling

**Happy path**: toolbar click → background worker checks entitlement → creates the offscreen
document if none exists → each frame's content script builds and registers its digest → the
offscreen document merges them, composes the prompt, opens the Realtime session → model
directives carry a frame ID and are routed to the owning content script for cursor flight or
action execution → usage reported to `/api/extension/usage` on session end.

**Tab navigation mid-session**: a session is tied to the tab it started in; navigating to a new
URL ends the current session cleanly (offscreen document closes the Realtime connection) rather
than attempting to follow the user across pages. Re-activating on the new page starts fresh.

**Background service worker restarted mid-session** (normal MV3 behavior): harmless by
construction — the Realtime session lives in the offscreen document, which persists
independently; the worker only needs to re-register its message listeners on wake.

**Entitlement exhausted mid-task**: surfaced as an in-page banner via the existing widget bubble
component in the active frame (not only in the popup, which is easy to miss mid-task) — same
visual language as the Mac app's trial/cap modals.

All of the above rides on the session-lifecycle rules already documented in CLAUDE.md under "Web
SDK Session Lifecycle Protection" (the `closed` flag, generation counter, pause-before-null audio
teardown) — since `realtime.ts` is reused verbatim in the offscreen document, those protections
apply automatically and must not be altered when it's adapted into `sdk/browser-core`.

## Testing

- `sdk/browser-core`: existing `sdk/web` test coverage for the extracted modules carries over
  with import-path changes only — this is an extraction, not a rewrite.
- New coordination logic (digest merging, message routing, skill URL matching): pure functions,
  unit-tested without a browser, following the `actions.ts` guardrail-test pattern.
- Backend: `bun test` coverage for `/api/extension/*` mirroring the existing
  `macSession.test.ts`/`tenantService.test.ts` pattern.
- Integration: WXT's Playwright support, loading the unpacked extension into real Chromium, for
  the parts that need a real browser (`chrome.offscreen`, `chrome.identity`, content-script
  injection, cross-origin iframe pointing).
- Manual, pre-release: a real WorkOS login round-trip, a real mic session end-to-end, and a
  constructed test page with a cross-origin iframe to confirm pointing/actions reach into it.

## Non-goals for v1

- No options page / no user-configurable confirm policy (decision 6 is a fixed default).
- No cross-tab or multi-page task orchestration (a single tab's session, per the tab-navigation
  rule above).
- No new backend auth mechanism — entitlement and identity are fully inherited from the existing
  WorkOS/Polar setup.

## Risks / sequencing notes

- **Safari is a materially different distribution path than Chrome/Firefox**: it requires Apple's
  `safari-web-extension-converter`, Xcode packaging, an Apple Developer account, and App Store
  review — not just a second WXT build target. The codebase should be structured for it from day
  one (per decision 3), but Safari's actual release may land as a later milestone within this
  project rather than simultaneously with the Chrome/Firefox launch — a sequencing call for the
  implementation plan, not a change to the decision.
- **`/api/extension/*` is new, unproven surface** (unlike `/api/mac/*`, which at least has
  unauthenticated smoke tests run against it) — the implementation plan should include an early
  end-to-end auth spike before building the rest of the extension against it.
- **`sdk/browser-core` extraction touches shipped, working code** (`@skilly/web`). The extraction
  itself should be a small, separately-reviewable change with `sdk/web`'s existing test suite as
  the regression guard, landed before any extension-specific code is written.
