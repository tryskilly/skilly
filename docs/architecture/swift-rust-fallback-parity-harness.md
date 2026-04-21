# Swift-Rust Fallback Parity Harness

## Purpose
Define how we validate behavior parity when a Rust bridge is available versus when Swift fallback logic is used.

This harness applies to:
- policy gating (`RustPolicyBridge`)
- skill prompt composition (`RustSkillsBridge`)
- realtime transition replay (`RustRealtimeBridge`)

## Core Principle
For each bridge-backed decision path, we verify two lanes:
1. Rust lane: bridge loaded and Rust result used.
2. Swift lane: bridge unavailable and Swift fallback used.

The expected outcome must match for equivalent inputs unless a migration ADR explicitly declares a behavior change.

## Runtime Toggle Strategy
Bridge load behavior is controlled by environment variables and dylib availability.

Recommended local toggles in Xcode scheme:
- Rust lane:
  - set `SKILLY_RUST_CORE_DYLIB_PATH` to a valid `libskilly_core_ffi.dylib`
- Swift lane:
  - unset all `SKILLY_RUST_*_DYLIB_PATH` vars (or point to a non-existent path)

## Parity Scenarios

### Policy Scenarios
1. Trial user under cap -> allowed.
2. Trial user exhausted -> blocked (`trialExhausted`).
3. Active user under cap -> allowed.
4. Active user over cap -> blocked (`capReached`).
5. Admin user over cap/expired -> allowed.
6. Canceled user with valid access under cap -> allowed.
7. Canceled user with valid access over cap -> blocked (`capReached`).

### Skill Prompt Scenarios
1. Active skill with full vocabulary budget.
2. Active skill where vocabulary trimming applies.
3. Active skill stage with completed-stage history.
4. Missing current stage fallback behavior.
5. Pointing mode variants (`always`, `when-relevant`, `minimal`).

### Realtime Transition Scenarios
1. Happy path turn:
   - `turn_started -> audio_capture_committed -> audio_playback_started -> response_completed`
2. Error path:
   - `turn_started -> audio_capture_committed -> session_error`
3. Reset path:
   - `completed -> session_reset`
4. Invalid-order rejection:
   - `turn_started -> response_completed` (without commit)

## Verification Procedure
1. Run Rust fixture/unit checks:
   - `cargo test --workspace`
2. Run shell smoke checks:
   - `cargo run -p skilly-linux-shell -- --smoke`
   - `cargo run -p skilly-windows-shell -- --smoke`
3. Run manual macOS parity in Xcode:
   - lane A (Rust enabled): perform each scenario and capture observed outcomes.
   - lane B (Rust disabled): repeat scenarios.
4. Compare:
   - decision values
   - block reasons
   - prompt output text shape
   - lifecycle phase progression

## Evidence Capture
For each scenario, record:
- lane (`rust` or `swift`)
- input snapshot
- output snapshot
- parity result (`match` / `mismatch`)
- notes

Store evidence in:
- `docs/architecture/runtime-validation-report-YYYY-MM-DD.md` generated via:
  - `./scripts/create-runtime-validation-report.sh`
- or PR body under "Parity Evidence" when a dedicated report is not required.

## Failure Policy
If a mismatch is found:
1. Treat it as a regression by default.
2. Add a focused fixture test reproducing mismatch.
3. Fix Rust or Swift path to restore parity.
4. If change is intentional, document it in an ADR and update expected fixtures.
