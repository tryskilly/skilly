# Sketch: Skilly Chrome Extension

> Status: **Idea sketch, not proposed as a phase.** Written to answer "should we build this"
> concretely next time it comes up, per the reuse-vs-net-new breakdown requested after the
> architecture review. Companion to `web-sdk-sketch.md` (the embeddable widget this reuses).

## The product, in one line

A user-installed extension that gives Skilly (see → point → talk) on **any site**, not just
sites a tenant has installed the widget on — the B2C "teach me anything on the web" story the
embeddable widget traded away when it became B2B (tenant pays, tenant's visitors benefit).

## Why this fits the existing architecture

The Rust-core migration already treats the browser as one binding target among several
(desktop via FFI dylib, mobile via UniFFI, web via `wasm-bindgen`). An extension is not a
fourth core consumer — it's a **second shell around the exact `skilly-core.wasm` already built
for `@skilly/web`**, loaded the same way (`core.ts`'s lazy/tolerant `loadCore()`). Nothing new
compiles on the Rust side.

More importantly: the B2C entitlement backend this would need **already exists**, just shipped
for the Mac app. The `/api/mac/{entitlement,openai/token,usage,byok/checkout}` routes and
`macSession.ts` (landed on `feature/web-actions` in the BYOK/Studio-parity migration) are an
end-user-owned-key auth model on `apps/web-backend` — structurally identical to what an
extension needs. And the web-sdk wasm already exposes `canStartTurn`, `trialIsExhausted`,
`usageIsOverCap` (from `core/policy` — the same Rust source `TrialTracker`/`UsageTracker` wrap
in Swift) — those functions are unused by the current tenant-quota widget flow, but they are
**already compiled and already shipped in the wasm bundle**, sitting there for exactly this.

## The key reframe: script tag → content script, tenant → end user

| Widget concept (`@skilly/web`) | Extension equivalent | Why it differs |
| --- | --- | --- |
| `<script data-skilly-key="pk_...">` on the tenant's page | Manifest V3 content script, injected on toolbar click or `activeTab` | No site owner in the loop — the user brings Skilly to the page |
| Publishable key + origin allowlist (`authenticateWebRequest`) | End-user login (WorkOS, same as Mac) + entitlement poll | The payer changes from tenant to individual — this is the real new surface |
| `/api/web/token` (tenant-scoped mint) | `/api/mac/openai/token`-shaped route, reused/renamed | Auth model already built, not re-invented |
| SKILL.md the tenant authored about their product | No tenant skill — either a generic "teach me this page" prompt, or the bundled skill library (Blender/Figma-web/etc.) if the open tab matches a known product | Different content source, same `composePrompt` |
| Single top-frame injection | `all_frames: true` content script, one instance per frame, coordinated via `chrome.runtime` messaging | Genuinely new capability: reaches cross-origin iframes the embed script can never see, because the *extension* holds the permission, not the frame |

## Reuse map

**Direct reuse, unchanged (~1,300 of ~2,300 sdk/web lines):**
- `digest.ts` — DOM digest/registry; operates on `document`, doesn't know how it was loaded.
- `pointing.ts` — selector resolution + bezier cursor flight; same.
- `actions.ts` (Phase 10.0) — click/fill executor + guardrails; same, though the confirm-by-
  default policy may loosen for a user-owned tool acting on their own behalf vs. a tenant's
  visitor — a real product decision, not an engineering one.
- `prompt.ts` — `composePrompt`/`buildCompanionInstructions`; pure string building.
- `realtime.ts` — WebRTC session to OpenAI Realtime; wire protocol is identical.
- `core.ts` — wasm loader, verbatim.
- `SkillyController` (`index.ts`), most of it — the session state machine, generation-guard
  lifecycle, action wiring. Only the ~20-line auto-init block keyed on `document.currentScript`
  is embed-specific.
- `widget.ts` — Shadow-DOM UI (cursor, bubble, confirm chip); a content script injects a host
  element and mounts the same class.

**Adapted, not rebuilt:**
- `token.ts` — swap `X-Skilly-Key` publishable-key auth for end-user session auth against the
  `/api/mac/*`-shaped routes; the request/response shapes already exist as a pattern to copy.
- Bootstrapping — replace the `data-skilly-*` script-attribute config with extension
  storage (`chrome.storage.sync`) + a popup/options page for login and preferences.

**Genuinely net-new:**
- `manifest.json`, background service worker, content-script injection/permissions model,
  toolbar popup UI, options page.
- Chrome Web Store listing + review — a big permission ask (`host_permissions: <all_urls>`,
  microphone) paired with an AI voice product invites more review scrutiny than a typical
  extension; budget for it.
- Cross-tab/multi-page task coordination (mirrors what `page-agent`'s README calls out its own
  extension for) — out of scope for a v1 that's just the widget in a content-script shell.

## Open questions before this becomes a real phase

1. **Manifest V3 constraints on the wasm core and WebRTC** — both are standard web-platform
   APIs (no remote code eval involved), so this is very likely fine, but should be verified in
   a throwaway spike before committing.
2. **Confirm-chip default for Actions** — tenant-visitor confirm-by-default was a deliberate
   safety call for someone acting on a stranger's site; a user's own extension acting on pages
   *they* browse is a different trust boundary and may warrant its own policy, not a copy-paste.
3. **Does core/policy's trial/cap model need any change to serve a THIRD B2C surface** (Mac +
   extension) sharing one entitlement, or does one WorkOS identity naturally span both? Likely
   the latter — worth confirming, not assuming.

## Recommendation on sequencing

Don't start this until the Mac↔Studio backend-parity migration (in flight on
`feature/web-actions` as of 2026-07-26) is merged and stable — the extension's entire auth/
billing story is a direct reuse of that migration's `/api/mac/*` surface, so building it against
a still-moving target would mean redoing the integration once, not saving the work.
