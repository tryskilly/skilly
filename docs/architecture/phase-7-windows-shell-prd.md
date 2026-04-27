# PRD Addendum: Phase 7 — Windows Host App (Rust + Tauri)

Status: draft
Date: 2026-04-27
Branch: `feature/skills-bridge-swift`
Supersedes section "Open Questions #2" of the parent PRD (`rust-core-native-shells-prd.md`).

## Summary
Phase 7 ships the first real native host app built on the Rust core: a Windows desktop application using Tauri 2. This is no longer a CLI smoke binary — it is a code-signed, installer-distributed, end-user app that runs the Skilly teaching companion on Windows.

This addendum also commits to a follow-on Phase 8 in which the macOS host migrates from the existing SwiftUI implementation to the same Rust + Tauri stack, deprecating the Swift host. Phase 8 is out of scope for this PRD but is named here so Phase 7 design choices can be made with that future migration in mind.

## Strategy Pivot Acknowledgment
The parent PRD's non-goal #1 was "Rewrite current macOS UI in a cross-platform UI framework." Phase 7 + 8 together reverse that decision. The reasons:
1. Phase 5 marked "Real Platform Adapters" complete, but the Windows/Linux adapters are env-var-driven stubs. Shipping a real Windows app forces real adapter implementations.
2. Maintaining two host implementations long-term (SwiftUI on macOS, fresh Rust on Windows) doubles the surface area indefinitely.
3. The Rust core is now stable; building a host on top of it is the next blocking-deliverable.
4. macOS Skilly v1.5 keeps shipping on the SwiftUI host while Phase 7 progresses, so revenue continuity is preserved.

## Problem
Today there is no shippable Skilly experience on Windows. The Rust core, FFI surface, and adapter contracts exist, but the Windows shell binary cannot be installed by an end user, has no UI, no audio pipeline, no real screen capture, no overlay, and no auth flow. The macOS-to-Windows TAM gap is a meaningful business cost.

## Goals
1. Ship a code-signed, installer-distributed Windows desktop app named "Skilly" with bundle identity `app.tryskilly.skilly`.
2. Reuse the existing Rust core (`core/policy`, `core/skills`, `core/realtime`, `core/domain`) without forking logic.
3. Reuse the existing Cloudflare Worker proxy unchanged — no new endpoints, no client-side API keys.
4. Achieve a v1 that delivers the core teaching loop: push-to-talk → screen capture → realtime AI response → cursor pointing.
5. Establish the Windows release pipeline (signing, MSI/MSIX/NSIS, auto-update) so future versions can ship with low overhead.
6. Set patterns Phase 8 (macOS migration) can adopt directly.

## Non-goals (v1 scope cuts)
1. In-app subscription/Polar checkout UI — exhausted free trial redirects users to web checkout.
2. Multi-monitor cursor overlay — primary monitor only.
3. CapReachedModal and SubscriptionRequiredModal flows — v1 is free-trial only; paid users handled through web checkout for now.
4. Per-skill overflow menu (Pause/Resume/Reset/Show in Finder/Remove) — only Activate / Deactivate.
5. Settings tabs beyond Account and push-to-talk customization.
6. Admin allowlist UI surface.
7. Skill marketplace UI — drag-drop folder install only.
8. Custom voice picker — server-default voice only.
9. Telemetry JSONL viewer / debug surfaces.
10. Linux host app — explicit deferral to Phase 9+.

## Users
- New Windows users discovering Skilly for the first time.
- Existing macOS subscribers asking when Windows ships.
- QA / release: validates installer, code-signing, auto-update, baseline teaching loop.

## Platform Floor
Minimum supported: **Windows 11 22H2 (build 22621) on x64 and ARM64.**

Rationale:
1. Windows Graphics Capture API (`Windows.Graphics.Capture`) is stable and supported on this baseline; pre-22H2 has multi-monitor coordinate quirks we will not work around in v1.
2. WebView2 Evergreen runtime is universal on this baseline (Tauri requirement).
3. Drops the long tail of Win 10 servicing branches that we cannot QA solo.

Windows 10 support is explicitly deferred. Users below 22H2 are shown an unsupported-version notice in the installer.

## UI Stack Decision: Tauri 2
Selected over alternatives:

| Option | Verdict | Reason |
|---|---|---|
| Tauri 2 | **Selected** | Rust backend co-located with core; web frontend reuses HTML/CSS skill from Worker landing pages; tray + global hotkey + WebView2 packaged; ~5–10 MB installer baseline |
| egui | Rejected | Pure-Rust UI is great for tools but companion-panel polish (animations, blur, custom shadows) is a high cost in immediate-mode UI |
| Native Win32 + WebView2 | Rejected | Reinvents what Tauri already provides; more brittle integration with `windows-rs` |
| Slint | Rejected | Smaller community, fewer Windows-specific integrations available off the shelf |
| .NET / Avalonia / WinUI 3 | Rejected | Brings a non-Rust runtime; conflicts with Phase 8 unification |

Constraint: the chosen stack must be the same one Phase 8 (macOS migration) adopts. Tauri 2 satisfies this — it ships a working macOS target.

## Architecture

```
Tauri 2 app (Windows host)
├── Frontend (TypeScript + WebView2)
│   ├── Companion panel UI (port of CompanionPanelView design tokens)
│   ├── Tray menu
│   ├── Settings (Account, Push-to-Talk)
│   └── Auth deep-link landing
├── Tauri commands (Rust)
│   ├── push_to_talk_pressed / released
│   ├── start_session / end_session
│   ├── activate_skill / deactivate_skill
│   ├── get_entitlement / start_checkout (opens web)
│   └── apply_settings
└── Rust subsystems
    ├── skilly-core-domain        (existing, unchanged)
    ├── skilly-core-policy        (existing, unchanged)
    ├── skilly-core-skills        (existing, unchanged)
    ├── skilly-core-realtime      (existing, unchanged)
    ├── skilly-core-ffi           (existing — used directly, not via dylib)
    ├── windows-shell::adapters
    │   ├── capture   → windows-rs Graphics Capture API
    │   ├── hotkey    → RegisterHotKey for primary path; RAW_INPUT fallback
    │   ├── overlay   → layered window via windows-rs
    │   ├── audio_in  → wasapi crate at PCM16 16 kHz mono
    │   ├── audio_out → wasapi crate at PCM16 24 kHz
    │   ├── auth      → reqwest + skilly:// URL protocol handler
    │   ├── store     → Windows Credential Manager via windows-rs
    │   └── realtime  → tokio-tungstenite OpenAI Realtime client (Rust port of OpenAIRealtimeClient.swift)
    └── windows-shell::ui_bridge  (Tauri command surface)
```

Key principles:
1. The existing CLI smoke binary `apps/windows-shell/src/main.rs` is preserved and continues to gate CI; the GUI app is a new crate `apps/windows-shell-gui` that depends on the same adapters once they are real.
2. Adapter modules expose the env-var stubs in test mode and real APIs in production mode behind a `cfg!` switch. Existing `--smoke` flow keeps passing.
3. The Worker proxy is reused unchanged. No new endpoints. The OpenAI client secret is fetched the same way.
4. The same `appcast.xml` feed used by macOS Sparkle is reused for `tauri-updater` after a feed format adapter (`appcast-windows.xml` or shared format).

## Functional Requirements

### Auth
1. Sign-in opens default browser via `tauri-plugin-shell` to Worker `/auth/url?state=…` exactly like macOS.
2. `skilly://auth/callback` URL protocol is registered by the installer (`HKCU\Software\Classes\skilly`).
3. Tokens stored in Windows Credential Manager keyed by app identifier.
4. Sign-out clears credentials and returns user to signed-out tray state.

### Billing (v1 scope)
1. 15-minute lifetime free trial enforced by Rust `policy::can_start_turn` against `TrialTracker` state.
2. On trial exhaustion, app shows a tray notification and opens Worker `/checkout/create` in default browser.
3. After web checkout completes, app polls `/entitlement` and updates local trial/usage state.
4. No in-app paywall modals in v1.

### Push-to-Talk
1. Default chord: `Ctrl + Alt`. Customizable in Settings.
2. `RegisterHotKey` is primary mechanism; if unavailable (locked-down enterprise machines), fall back to `RAW_INPUT` listener tied to a hidden window.
3. Hold-to-record semantics matching macOS: press starts capture, release commits the turn.

### Capture
1. Windows Graphics Capture API for primary monitor.
2. JPEG encoding before send via `image` crate.
3. Multi-monitor support deferred to v2.

### Overlay
1. Layered, click-through, always-on-top window for the Skilly cursor.
2. SwiftUI `OverlayWindow.swift` bezier flight animation ported to canvas-based rendering (HTML canvas inside an additional Tauri window, or `windows-rs` direct draw).
3. Response bubble follows cursor; auto-hide after 6 seconds matching `CompanionResponseOverlay`.
4. Single primary monitor only in v1.

### Audio
1. Capture: WASAPI shared-mode at 16 kHz mono PCM16.
2. Playback: WASAPI shared-mode at 24 kHz PCM16.
3. Default device only in v1; device picker deferred.

### Realtime
1. Rust port of `OpenAIRealtimeClient.swift` using `tokio-tungstenite` against `wss://api.openai.com/v1/realtime`.
2. Same event surface that the existing Swift client emits, mapped through `core/realtime`.
3. Telemetry JSONL written to `%LOCALAPPDATA%\Skilly\skilly-telemetry.jsonl`.

### Skills
1. Loader reads `%APPDATA%\Skilly\skills\` on launch.
2. Drag-drop install: dropping a folder onto the panel or tray icon copies it into the skills directory.
3. Bundled skills shipped in installer payload, seeded on first launch (matches macOS `SkillStore` behavior).
4. Activation/deactivation only — no per-skill overflow menu.

### Tray + Panel
1. Tray icon with menu: Open Panel / Toggle Active Skill / Settings / Quit.
2. Panel: borderless WebView2 window, 360 × 600 logical units, dark theme matching macOS panel.
3. Hover-to-show / click-outside-to-hide behavior.

## Release Pipeline
1. Code signing: Apply for an EV code signing certificate (DigiCert / Sectigo / SSL.com). Budget 1–3 weeks lead time and ~$300–500/year. Track procurement as a critical-path item.
2. Installer: NSIS via `tauri-bundler` — produces `Skilly-{version}-setup.exe`. MSIX deferred; MSI not required for v1.
3. Auto-update: `tauri-updater` plugin against `appcast-windows.xml` hosted at the same domain as macOS appcast.
4. Distribution: GitHub Releases (matches existing macOS distribution); landing page download CTA on `tryskilly.app`.
5. Telemetry: PostHog identify with WorkOS user ID, mirroring macOS event names where applicable.

## Success Metrics
1. Installer downloads from GitHub Releases reach 100 in first 4 weeks post-launch.
2. End-to-end teaching loop (sign-in → activate skill → push-to-talk → cursor points) verified on 3 different physical Windows 11 22H2+ machines before launch.
3. Crash-free session rate ≥ 95% over the first 1,000 turns measured via PostHog.
4. Trial-to-checkout conversion rate measurable (i.e., the redirect-to-web flow does not silently break).
5. Zero regression in macOS release pipeline during Phase 7.

## Risks and Mitigations
| Risk | Mitigation |
|---|---|
| EV cert procurement delay blocks ship | Order in week 1, do all dev unsigned, sign at the very end |
| Windows Graphics Capture quirks on specific GPU drivers | Limit support to Win 11 22H2+ where API is stable; add capability probe at startup |
| Layered window + DPI scaling edge cases | Abstract DPI math behind one helper module with unit tests; QA on 100% / 125% / 150% / 200% scaling |
| WebView2 runtime missing on user machine | Bundle the Evergreen redistributable in the installer |
| Realtime WebSocket port introduces drift vs Swift | Port file-by-file with a side-by-side parity test that replays the same fixture transcripts through both clients |
| Auto-update format divergence from macOS Sparkle | Define a shared appcast schema upfront; document in `docs/architecture/appcast-schema.md` |
| Solo dev burnout on 6–10 week scope | Stage releases: alpha → closed beta → public — each stage cuts QA time by gating audience size |

## Timeline (target, solo dev)
- Week 1: PRD freeze; spike — Tauri shell + tray + global hotkey + WASAPI loopback; EV cert order placed.
- Weeks 2–3: Capture + overlay adapters; OpenAI Realtime Rust client port begins.
- Week 4: Auth flow + Credential Manager + Worker integration; skill loader.
- Week 5: Realtime client complete; teaching loop end-to-end on dev machine.
- Week 6: Settings UI + push-to-talk customization + telemetry; bundled skills seeding.
- Week 7: Installer + auto-update plumbing; closed alpha to ~5 testers.
- Week 8: Polish, crash fixes, EV cert (assuming arrived by now); public beta.
- Week 9–10: Buffer for installer/signing surprises.

## Out-of-scope (deferred to Phase 7.x or Phase 8)
1. macOS migration to the same Tauri stack — Phase 8.
2. Linux host app — Phase 9.
3. Multi-monitor overlay.
4. In-app subscription / Polar checkout UI on Windows.
5. Skill marketplace UI.
6. Per-skill overflow menu parity with macOS.
7. Custom voice picker.
8. Sub-Win-11 support.

## Open Questions
1. Should the appcast feed be unified (`appcast.xml` with platform-suffixed URLs) or split (`appcast-mac.xml` / `appcast-windows.xml`)? Default to split; revisit at Phase 8.
2. Should the trial duration on Windows match macOS (15 minutes lifetime) or be relaxed for a launch promotion (e.g., 30 minutes)? Default to match macOS for fairness; revisit pre-launch.
3. Does Windows-first launch require localization (DE / FR / JA) or can it ship English-only? Default English-only for v1.
4. Should we offer a one-time lifetime price tier on Windows v1 to acquire early adopters? Defer to product owner decision before week 6.

## Acceptance Criteria for Phase 7 Closure
1. Signed installer produces a working Skilly install on a clean Windows 11 22H2 VM.
2. Sign-in via WorkOS works end-to-end, tokens persist across app restart.
3. Push-to-talk → capture → realtime response → cursor pointing observed working with the bundled Blender skill.
4. Auto-update successfully upgrades from version N to N+1 on the same machine.
5. Telemetry events flow to PostHog tagged with `platform: windows`.
6. macOS release pipeline produces an unrelated v1.6 release without regression during Phase 7 development.
