# Merge Plan: `feature/skills-bridge-swift` → `develop` (slice by slice)

> Goal: land the canonical cross-platform branch into `develop` in small, reviewable, **core-first**
> slices instead of one 77-file / +15k PR. Pairs with `branch-triage-2026-06-03.md` and
> `parallel-agent-guidelines.md`. Target branch is **`develop`** (NOT `main` — main stays frozen).

## Conflict reality (measured 2026-06-03)
- **Merge base:** `389d469` (v1.5, 2026-04-16). The branch is mostly **net-new files** → almost
  no conflicts. `develop` has v1.6–v2.0 on top of that base.
- **The complete true-conflict set is only 6 files** (changed on BOTH sides since the merge base):
  - `.gitignore`
  - `leanring-buddy/EntitlementManager.swift`
  - `leanring-buddy/TrialTracker.swift`
  - `skills/houdini-essentials/SKILL.md`
  - `skills/README.md`
  - `skills/SPEC.md`
- Everything else (`core/**`, `apps/**`, `sdk/**`, `scripts/**`, `docs/**`, the other 7 Swift
  bridge files) is **additive — zero conflict.**
- **`CompanionManager.swift` does NOT conflict** (it changed on the branch but not on develop
  since v1.5 — verified). Still review it, but no merge conflict expected.

## Slicing method: path-scoped checkout (not a full merge)
Because the slices are path-disjoint, each slice is built by pulling only its paths from the branch
onto a fresh branch off `develop`:
```bash
git switch develop && git pull
git switch -c merge/slice-N-<name>
git checkout origin/feature/skills-bridge-swift -- <paths for this slice>
# resolve any of the 6 conflict files by hand (see per-slice notes)
# validate (cargo test etc.) → commit → PR into develop → review → merge
```
Do **not** `git merge` the whole branch. Slices are independent PRs into `develop`.

## Slice order & dependencies
```
Slice 1 (Rust core workspace)  ← FIRST, unblocks everything, zero Swift conflict
   ├── Slice 2 (Swift desktop bridges)   ┐
   ├── Slice 3 (Mobile SDK bindings)     ├─ parallel after Slice 1 (different lanes)
   └── Slice 4 (Windows/Linux shells)    ┘
Slice 5 (docs + scripts + skills content) ← anytime; owns the skills/ conflict resolution
```

---

## Slice 1 — Rust core workspace  ★ do this first
**Paths:** `core/` (entire: `domain`, `policy`, `skills`, `realtime`, `ffi`, `mobile-sdk` + all
fixtures + `core/README.md`), `Cargo.toml`, `Cargo.lock`, `.github/workflows/rust-core-shells.yml`,
`.gitignore`.
**Why whole `core/` atomically:** the workspace `Cargo.toml` lists every crate as a member; bringing
a subset breaks `cargo check`. The whole workspace is net-new and builds together.
**Conflicts:** only `.gitignore` (trivial — union the Rust `target/` ignore lines).
**Validate (agent-safe):** `cargo check && cargo test` from repo root — must pass (policy + skills +
realtime fixture parity).
**Risk:** lowest. Pure additive Rust; `core/` does not exist on `develop`.
**Unblocks:** Web SDK 8.0, Slices 2/3/4.

## Slice 2 — Swift desktop bridges
**Paths:** `leanring-buddy/RustPolicyBridge.swift`, `RustRealtimeBridge.swift`,
`RustSkillsBridge.swift`, `SkillPromptComposer.swift`, `AdminAllowlist.swift`,
`CompanionManager.swift`, `EntitlementManager.swift`, `TrialTracker.swift`, `UsageTracker.swift`;
plus `docs/architecture/{rust-dylib-packaging-strategy,swift-rust-fallback-parity-harness}.md` and
`scripts/package-rust-ffi-dylib.sh`.
**Depends on:** Slice 1 (the bridges `dlopen` the FFI from `core/ffi`).
**Conflicts (2):** `EntitlementManager.swift`, `TrialTracker.swift` — both sides changed since v1.5.
Resolution: take the branch's Rust-bridge wiring **and** re-apply develop's v1.6–v2.0 additions
(BYOK, instrumentation, entitlement refinements). Keep all Skilly edits additive + `// MARK: - Skilly`.
**Validate:** ⚠ **No `xcodebuild`** (TCC). Agent verifies the Swift↔FFI ABI matches `core/ffi`
(enum/struct field order, `skilly_policy_ffi_version`) by reasoning; **human builds in Xcode** to
confirm trial/active/capped/admin turn-start + Rust-absent fallback path.
**Risk:** medium (the only slice with real Swift conflicts).

## Slice 3 — Mobile SDK (iOS + Android)
**Paths:** `sdk/ios/**`, `sdk/android/**`, `sdk/README.md`, `scripts/generate-mobile-sdk-bindings.sh`,
`scripts/package-mobile-sdk.sh`, `scripts/validate-mobile-sdk-consumers.sh`,
`.github/workflows/mobile-sdk-artifacts.yml`,
`docs/architecture/mobile-sdk-phase-validation-report.md`.
**Depends on:** Slice 1 (`core/mobile-sdk` already lands there).
**Conflicts:** none (all net-new).
**Note:** `sdk/*/generated/**` is UniFFI-generated — do not hand-edit; regen via the script if the
core surface changed.
**Validate:** run `scripts/generate-mobile-sdk-bindings.sh` and confirm output matches committed
generated files; `cargo test -p` the mobile-sdk crate.
**Risk:** low.

## Slice 4 — Windows + Linux shells
**Paths:** `apps/windows-shell/**`, `apps/windows-shell-gui/**`, `apps/linux-shell/**`,
`docs/architecture/{adapter-contracts,phase-7-windows-shell-prd}.md`.
**Depends on:** Slice 1 (shells call the shared core via adapter contracts).
**Conflicts:** none in git — BUT ⚠ the **working tree already has an untracked partial
`apps/windows-shell-gui/gen/schemas/`**. Reconcile: confirm it's a stale local artifact, remove or
let the branch version win; do not commit the partial alongside the full one.
**Validate:** `cargo check` the shell crates (Tauri 2). No GUI run required for the slice.
**Risk:** low (isolated `apps/` lane).

## Slice 5 — Docs, scripts, skills content
**Paths:** remaining `docs/architecture/*` reports (validation/signoff/runtime), remaining
`scripts/*`, `skills/README.md`, `skills/SPEC.md`, `skills/houdini-essentials/SKILL.md`.
**Conflicts (3):** the `skills/` trio. `develop` already has Houdini (commit `33bdde3`,
"recovered from feature branch case-mismatch") and may track it under **`Skills/`** (capital).
Resolution: pick the **single canonical casing** (confirm with `git ls-files | grep -i skills`),
de-dupe Houdini, and keep one README/SPEC. See guidelines §6.
**Validate:** docs only — no build. Run `SkillValidation`-equivalent check on the SKILL.md if touched.
**Risk:** low content-wise, but **must fix the `skills/` vs `Skills/` casing** here, not paper over it.

---

## Pre-flight reconciliation (before Slice 1)
1. **Uncommitted `AGENTS.md`** on the working tree adds the context-mode block; `skills-bridge-swift`
   also edits `AGENTS.md`. Decide the canonical `AGENTS.md` on `develop` first (commit the
   context-mode block, then let later slices merge cleanly). `AGENTS.md` is NOT in any slice above —
   handle it once, up front.
2. **Untracked `.sisyphus/`** is tooling state — add to `.gitignore` (folds into Slice 1's
   `.gitignore` resolution), do not commit.
3. **Untracked `apps/`** partial — see Slice 4.

## After all slices land on `develop`
- Run full `cargo test` + a human Xcode build smoke test on `develop`.
- Delete superseded branches: `architecture/rust-core-native-shells`, `feature/skills-core-rust`,
  `feature/policy-parity-rust`, and `feature/skills-bridge-swift` itself.
- `develop` is now the base for **Web SDK Phase 8** (8.0 can start immediately after Slice 1).
- Promote `develop` → `main` only when the whole structure is validated (one reviewed promotion).

## Parallelization (for multi-agent execution)
- Slice 1 is a **barrier** — it must land before 2/3/4 start (they consume `core/`).
- Slices 2, 3, 4 are **independent lanes** → assign to 3 agents in parallel, each in its own
  worktree, each PR-ing into `develop`. Slice 2 owner handles the only Swift conflicts.
- Slice 5 can run anytime by a 4th agent (owns the `skills/` casing fix).
- Each agent follows `parallel-agent-guidelines.md`: own branch off `develop`, own lane, status note.
