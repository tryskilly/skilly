# Promotion Plan: `develop` → `main`

> Status: **Draft for review.** Plans how to bring the `develop` integration branch
> (28 commits: the cross-platform Rust migration + mobile SDK + native shells + the
> complete Web SDK) into the frozen `main` (v2.0) — safely, without disrupting the
> shipping macOS release. Grounded in the measured `main…develop` diff (2026-06-04).

## 1. What's actually on `develop` (the measured delta)

`develop` is **28 commits** ahead of `main`. By area:

| Area | Files | Ships in the macOS app today? | Risk |
| --- | --- | --- | --- |
| `leanring-buddy/*.swift` (9 files) | Rust bridges + Entitlement/Trial/Usage routed through Rust | **YES** (compiles into the app) | **the only real risk** |
| `core/**` (Rust workspace) | domain/policy/skills/realtime/ffi/mobile-sdk/web-sdk | No — not bundled | inert |
| `apps/**` (Windows/Linux shells, web-backend) | shell crates + Next.js backend | No — separate apps | inert |
| `sdk/**` (ios/android/web) | generated bindings + `@skilly/web` | No — separate packages | inert |
| `docs/**`, `scripts/**`, `.github/**` | architecture docs, build scripts, CI | No | inert |

**Critical finding — release mechanics are untouched.** `develop` does **not** modify
`leanring-buddy.xcodeproj/project.pbxproj`, `worker/**`, `appcast.xml`, or `Info.plist`.
So the notarized-DMG + Sparkle-appcast release pipeline is byte-for-byte unchanged.

**Critical finding — the macOS runtime is effectively unchanged.** The 9 Swift files
add `Rust*Bridge.swift` loaders that `dlopen` `libskilly_core_ffi.dylib` **only if
present**, and fall back to the existing Swift logic when absent. The dylib is **not
bundled** into the app (no pbxproj build phase adds it). So in a normal build the
bridges always take the Swift fallback path → **runtime behavior matches v2.0.**
This was confirmed in the Slice 2 Xcode validation (console showed
`🦀 … using Swift fallback` and a full turn completed normally).

> Net: promoting `develop` is **low-risk for the shipping app** — almost everything is
> dormant net-new code, and the one live change is additive + fallback-guarded. The
> work is in *verifying* that, not in a risky cutover.

## 2. Goals & non-goals

**Goals**
1. Get `develop` onto `main` so it's the single source of truth (stop the long-lived divergence).
2. Preserve macOS release continuity — no regression in build, notarization, or auto-update.
3. Keep the new platforms (web, mobile, shells) clearly marked as **not-yet-released** until each has its own go-to-market.

**Non-goals**
1. Shipping the Web SDK / mobile SDK / shells to users *as part of this promotion*. They land on `main` as code, but their release is separate.
2. Enabling the Rust-core path in the shipping macOS app. That stays fallback-only until deliberately turned on (see §6).
3. Cutting a new macOS app version. Promotion is a merge, not a release.

## 3. Pre-promotion gates (must pass before merging)

- [ ] **G1 — Rust workspace green:** `cargo test --workspace` (19 binaries) + `cargo check --workspace`.
- [ ] **G2 — Web SDK green:** `sdk/web` `bun run typecheck` + `bun run build`; `apps/web-backend` `bun test` (27) + `tsc` + `next build`; `core/web-sdk` wasm build via `scripts/build-web-sdk.sh`.
- [ ] **G3 — macOS app builds in Xcode** off the `develop` tip (human; agents can't run `xcodebuild`/TCC). Smoke: trial / active / capped / admin turn-start + the `🦀 … Swift fallback` path. This is the gate that actually matters.
- [ ] **G4 — Real end-to-end OpenAI voice run** of the web pipeline with a live `OPENAI_API_KEY` in the backend (the one thing headless tests couldn't cover). Optional for promotion if web isn't releasing yet, but **required before the web SDK is announced**.
- [ ] **G5 — `AGENTS.md` accurate** for everything on `develop` (kept current per-slice; spot-check).
- [ ] **G6 — No secrets** in the diff (`git diff origin/main origin/develop | grep -iE 'sk-|pk_live|whsec_|api[_-]?key'` review; GitHub push-protection is a backstop).

## 4. Promotion mechanics (the merge itself)

Because `develop` was cut from `main` and only ever fast-forwarded via PRs, the merge is clean (no `main`-side commits since the cut except what's already reflected). Recommended:

1. **Open a PR `develop` → `main`** (don't push directly). Title: "Promote: cross-platform Rust core + mobile SDK + shells + Web SDK (8.0–8.6)". This gives a reviewable record and runs CI.
2. **Squash vs. merge-commit:** use a **merge commit** (not squash) — the 28 commits are already clean, slice-scoped, and individually validated; preserving them keeps the bisect history that documents how each piece landed.
3. **Tag `main` first:** `git tag pre-cross-platform-vX` on the current `main` tip before merging, so there's a one-command rollback point.
4. Merge the PR. `main` now contains everything.
5. **Keep `develop`** as the ongoing integration branch (re-cut/rebase onto the new `main`), or retire it and branch features off `main` — decide in §7.

## 5. Rollback plan

- The pre-merge tag (`pre-cross-platform-vX`) is the rollback target: `git reset --hard` is **not** needed — because the change is additive + fallback-guarded, a problem in the new code can't break the shipping app at runtime.
- If the macOS app regresses post-promotion, it can only be the 9 Swift files. Mitigation: those changes are isolated and `// MARK: - Skilly`-tagged; revert just those files on a hotfix branch off `main` without touching the rest.
- The release pipeline is untouched, so a macOS release can ship from `main` at any point independent of the new platforms.

## 6. The Rust-core "activation" decision (separate from promotion)

Promotion lands the Rust path as **dormant** (fallback-only). Turning it on in the shipping app is a **later, deliberate step** that requires:
1. A pbxproj build phase that builds + bundles `libskilly_core_ffi.dylib` (or ships it as a resource), OR the `SKILLY_RUST_POLICY_DYLIB_PATH` dev override for testing.
2. Parity sign-off: the Swift↔Rust fallback parity harness (`docs/architecture/swift-rust-fallback-parity-harness.md`) green on real builds.
3. A staged rollout (the bridges already make this safe: enable, watch telemetry, fall back instantly if absent).

**Recommendation: promote with the path dormant, activate later.** Don't couple "get the code onto main" with "change what the app actually runs."

## 7. Post-promotion: branch model going forward

Two options — pick one:
- **(A) Keep `develop`** as a permanent integration branch (re-cut from `main` after promotion). Good if web/mobile/shell work continues at volume in parallel with macOS.
- **(B) Retire `develop`**, branch features off `main` directly (the pre-`develop` model). Good if the cross-platform push slows and macOS is again the primary line.

Recommendation: **(A)** while the Web SDK is being taken to launch (8.x → release needs its own slices: real OpenAI run, CDN hosting of `web.js`, WorkOS-backed dashboard auth, production Postgres). Revisit once web ships.

## 8. Release tracks after promotion (each is its own effort, NOT this promotion)

| Product | What's on `main` after promotion | What it still needs to ship |
| --- | --- | --- |
| **macOS app** | unchanged v2.0 behavior + dormant Rust path | nothing to keep shipping; Rust activation per §6 |
| **Web SDK** | functionally complete (8.0–8.6) | real OpenAI run (G4), CDN for `web.js`, prod Postgres, WorkOS dashboard auth, pricing page |
| **Mobile SDK** | iOS/Android UniFFI bindings + samples | a real consuming app; not a standalone release |
| **Windows/Linux shells** | bootstrap + adapters, CI smoke | real capture/hotkey/overlay adapters (Phase 5 of the original roadmap) |

## 9. Recommended sequence (the actual checklist)

1. Run G1–G2 (agent-safe, automated). ✅ already green at draft time.
2. **Human:** G3 Xcode build + smoke off `develop`. ← the real gate.
3. Decide: include G4 (live OpenAI run) now, or defer with web marked unreleased.
4. Tag `main` (`pre-cross-platform-vX`).
5. Open `develop` → `main` PR; review; merge (merge-commit).
6. Confirm `main` builds (Xcode) + CI green.
7. Pick the branch model (§7).
8. Open the small pending items as their own issues: telemetry-dir bug fix; Rust-core activation (§6); web SDK launch checklist (§8).

## 10. Open questions for the reviewer

1. Do we run the **live OpenAI voice test (G4)** before promotion, or promote with web flagged unreleased and test after?
2. **Merge-commit vs. squash** for the promotion PR? (Plan recommends merge-commit.)
3. After promotion, **keep or retire `develop`** (§7)?
4. Is there appetite to **activate the Rust core** in the macOS app soon (§6), or leave dormant indefinitely?
