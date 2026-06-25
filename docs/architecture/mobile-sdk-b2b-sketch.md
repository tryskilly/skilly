# Sketch: Skilly Mobile SDK (B2B, embeddable)

> Status: Exploratory sketch (not an accepted ADR). The **mobile twin of the Web SDK**:
> a mobile-app owner embeds Skilly into their **native app** so their users get an
> interactive tutor/guide that sees the screen, points at UI, and talks them through it —
> inside the host app. Companion to `web-sdk-sketch.md` / `web-sdk-prd.md`. Proposed as
> a future **Phase 9**, built on the multi-tenant backend (8.4–8.6) already on `main`.

## The product, in one line
Instead of a *website* owner embedding `@skilly/web`, a **mobile-app owner** integrates
`@skilly/ios` / `@skilly/android` into their native app, and their app's users get the
Skilly companion — guided onboarding and live support that **sees the host app's UI,
points at the right element, and talks the user through it** — without leaving the app.

Same **B2B SaaS** as web (the app owner is the tenant; their app's users are the
end-users), same backend, same shared core — a second/third **embed surface**, not a new
product line.

## The one insight that makes it clean
Because the SDK runs **in-process inside the host app**, it can read that app's own UI
directly — exactly like the web widget reads the host page's DOM. So there's **no OS
permission wall** (unlike the standalone macOS app, which needs screen-recording +
accessibility). The "screen" the companion sees is the host app's **view/accessibility
hierarchy**, the mobile analog of the DOM digest.

## The core reframe: DOM → native view/accessibility tree

| Web SDK concept | iOS equivalent | Android equivalent |
| --- | --- | --- |
| DOM digest (a11y tree + element registry) | walk `UIWindow` view hierarchy + **accessibility tree** (`accessibilityIdentifier`, `accessibilityLabel`, frame) | walk Activity `decorView` **view tree** (`contentDescription`, resource-id, `getLocationOnScreen`+bounds) / **Compose semantics tree** |
| `[POINT:id:label]` → resolve selector → rect | resolve `accessibilityIdentifier` → view `frame` (screen coords) | resolve resource-id / `skilly` tag → view bounds |
| Shadow-DOM cursor overlay | transparent **passthrough `UIWindow`** above the app; animated cursor | transparent **overlay View** in the host Activity's content root; animated highlight |
| `getUserMedia` + WebRTC | `AVAudioSession` + WebRTC → OpenAI Realtime | `AudioRecord`/`AudioTrack` + WebRTC → OpenAI Realtime |
| `data-skilly="…"` annotation | `accessibilityIdentifier = "skilly:…"` | `View.tag` / a resource-id convention |
| origin allowlist | **app bundle id** allowlist | **package name** allowlist |
| no browser permission | mic permission only (normal app `NSMicrophoneUsageDescription`) | mic permission only (`RECORD_AUDIO`) |

Net: the mobile SDK is the **same companion**, with the native UI tree standing in for the
DOM and a native overlay standing in for the Shadow-DOM cursor.

## Architecture — reuse the backend + core, add a native surface

```
 Host mobile app (the app owner's native app)
 ┌──────────────────────────────────────────────────────────┐
 │  @skilly/ios (Swift Package)  /  @skilly/android (AAR)      │
 │  ├─ Public API: Skilly.init/start/on/destroy               │
 │  ├─ UI digest: accessibility / view (or Compose semantics) │
 │  ├─ Pointing: resolve id → element frame → overlay cursor  │
 │  ├─ Voice: native audio → OpenAI Realtime (WebRTC)         │
 │  └─ core/mobile-sdk (UniFFI)  ← shared Rust brain (exists) │
 │        policy · realtime · skills compose_prompt           │
 └───────────────┬────────────────────────────────────────────┘
                 │ publishable key (app-id-locked)
                 ▼
   apps/web-backend (SAME multi-tenant backend, 8.4–8.6)
   ├─ /api/web/token   validate pk + APP ID + quota → mint OpenAI token
   ├─ /api/web/skill   serve the tenant's SKILL.md
   ├─ /api/web/usage   meter session seconds
   ├─ dashboard        keys, SKILL.md authoring, plan/billing
   └─ Polar billing · Postgres · WorkOS
```

The backend barely changes: a publishable key is allowlisted to **app ids** instead of
(or alongside) web **origins**. Everything else — keys, metering, billing, SKILL.md
serving, the dashboard — is identical.

## Reuse map — what already exists
| Need (mobile) | Reuse | Action |
| --- | --- | --- |
| Token mint / keys / metering / billing | `apps/web-backend` (8.4–8.6) | Reuse; add app-id allowlisting (small schema + validation) |
| Brain: policy / realtime / skills compose | `core/mobile-sdk` (UniFFI, already on `main`) | Reuse as-is — the bindings already exist |
| SKILL.md authoring + safety scan | dashboard + `skillValidation.ts` | Reuse 100% (a tenant is now an app owner) |
| `[POINT]` protocol + prompt composition | web `prompt.ts` / `pointing.ts` logic | Mirror; same tag format and instructions |
| Token client | web `token.ts` | Mirror in Swift/Kotlin |

## Net-new (the native surface — mirrors web 8.1–8.3, per platform)
- **UI digest** from the accessibility / view hierarchy (iOS) and view tree / Compose
  semantics (Android) — the analog of `digest.ts`.
- **Overlay pointing engine**: a passthrough overlay window/view + resolve id → element
  frame → animate the cursor/highlight, re-anchored on scroll/navigation.
- **Voice pipeline**: native audio capture/playback → OpenAI Realtime over WebRTC.
- **Embeddable SDK packaging + public API**: a Swift Package (iOS) and an AAR (Android)
  with `Skilly.init/start/on/destroy`.

## Proposed Phase 9 (built on the existing backend)
- **9.0 Backend: app-id tenancy** — allowlist publishable keys by bundle id / package name
  alongside origin; dashboard lets a tenant register app ids. (Small; reuses the auth path.)
- **9.1 iOS embed skeleton** — Swift Package, public API, overlay `UIWindow` + cursor +
  bubble, simulated turn lifecycle (key-free demo).
- **9.2 iOS UI digest + pointing** — accessibility hierarchy → digest; resolve
  `accessibilityIdentifier` → frame → bezier-arc cursor flight; re-anchor on scroll/nav.
- **9.3 iOS voice** — `AVAudioSession` + WebRTC → OpenAI Realtime; token from the backend;
  feed `[POINT]` tags into the pointing engine.
- **9.4–9.6 Android** — the same three slices (skeleton → digest+pointing → voice) as an AAR.

Dependency: 9.0 first; iOS (9.1–9.3) and Android (9.4–9.6) are independent tracks. The
shared brain (`core/mobile-sdk`) and the backend are already done.

## Hard problems / open decisions
1. **UI frameworks — the real complexity.** Classic UIKit / Android Views introspect easily.
   But **SwiftUI** and **Jetpack Compose** don't expose a classic view tree — they have
   *semantics/accessibility* trees that need different APIs (and Compose overlays differ).
   Decision: target the **accessibility/semantics tree** as the canonical digest source
   (works across UIKit+SwiftUI and Views+Compose), accepting that un-annotated Compose/SwiftUI
   may need `accessibilityIdentifier`/`Modifier.testTag` for reliable pointing.
2. **Overlay scope** — an overlay tied to the current screen/Activity; re-anchor on
   navigation; cross-screen pointing is out of scope v1.
3. **Target stability** — accessibility ids change across app releases (like web selectors);
   push the annotation convention (`accessibilityIdentifier`/`testTag`) for robust pointing.
4. **Voice cost/latency** — same as web; a text/chat tier may be needed for unit economics.
5. **Privacy** — host app UI content + user voice flow to OpenAI; app owner = data
   controller, Skilly = processor. Same posture as web (consent UX, PII redaction in the digest).
6. **Distribution/size** — Swift Package + AAR, the WebRTC dependency's binary size,
   versioning, and not bloating the host app.

## What's the same as web (so it's genuinely one product)
- The tenant model, dashboard, keys, metering, billing, SKILL.md authoring.
- The shared Rust brain (policy/realtime/skills) — already bound for mobile.
- The `[POINT:id:label]` protocol and the "see → point → talk" interaction.

## Comparison anchor
Mobile in-app guidance tools (Appcues Mobile, Pendo Mobile, Chameleon). Skilly's wedge is
the same as on web: **voice + a companion that physically points at the live UI element**,
driven by an app-authored skill — not a static tooltip tour.

## One clarification (so the layering is exact)
`core/mobile-sdk` (UniFFI, already on `main`) is the **brain bindings**, NOT this product —
just as `core/web-sdk` (WASM) is the brain for web, and `@skilly/web` is the full widget on
top of it. The embeddable companions `@skilly/ios` / `@skilly/android` (brain + native eyes
+ voice + overlay) are a **new layer on top** of the existing bindings.
