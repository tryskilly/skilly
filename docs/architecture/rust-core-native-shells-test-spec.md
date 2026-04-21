# Test Specification: Rust Core + Native Shells Migration

## Purpose
Define verification coverage and release gates for migration phases so behavior remains stable while logic moves from Swift-only implementation to shared Rust core modules.

Related references:
- `docs/architecture/swift-rust-fallback-parity-harness.md`
- `docs/architecture/rust-dylib-packaging-strategy.md`

## Scope
1. Rust core unit and contract tests.
2. Swift bridge integration behavior (Rust-available and fallback modes).
3. Cross-platform shell smoke tests for baseline workflows.
4. Release pipeline safeguards for macOS continuity.
5. Mobile SDK binding generation and sample-usage coverage.

## Test Layers

### Layer 1: Rust Unit Tests
Applies to:
- `core/domain`
- `core/policy`
- `core/skills`
- `core/realtime`

Coverage:
1. Policy decisions across entitlement states and caps.
2. Admin allowlist behavior keyed by WorkOS user IDs.
3. Boundary values (`= max`, `max - 1`, no user id).

### Layer 2: Rust Contract/Fixture Tests
Input fixtures:
- `core/policy/fixtures/can_start_turn_cases.json`

Coverage:
1. Every fixture case returns exact expected decision + reason.
2. Fixture schema validation and deterministic ordering.

### Layer 3: Swift Bridge Integration
Targets:
- `RustPolicyBridge`
- `RustSkillsBridge`
- `RustRealtimeBridge`
- `EntitlementManager.canStartTurn()`
- `CompanionManager` turn lifecycle event tracking

Scenarios:
1. Rust dylib available -> Rust result used.
2. Rust dylib unavailable -> Swift fallback path used.
3. Reason code mapping remains correct across ABI boundaries.

### Layer 4: Host Behavior Smoke Tests
macOS:
1. Turn-start behavior remains correct for trial, active, capped, admin users.
2. Existing release pipeline still produces notarized DMG and appcast update.

Windows/Linux (future phases):
1. Auth session established.
2. Entitlement fetched.
3. Turn-start baseline path executes.

Windows/Linux (current shell binaries):
1. Capability-aware adapter gating executes before turn start.
2. Turn lifecycle replay reaches completed phase for baseline flow.
3. Explicit blocker reasons are emitted for unavailable critical adapters.

### Layer 5: Mobile SDK Surface
Targets:
- `core/mobile-sdk`
- `scripts/generate-mobile-sdk-bindings.sh`
- `sdk/ios/generated`
- `sdk/android/generated`

Coverage:
1. UniFFI-exported policy + realtime replay APIs compile and pass crate tests.
2. Swift and Kotlin bindings generate from a built mobile-sdk library.
3. Sample integration code remains aligned with generated API names and passes runtime consumer validation.

## Acceptance Gates by Phase

### Gate A (Phase 1 complete)
1. `cargo check` passes.
2. `cargo test` passes.
3. Rust bridge can produce expected decisions via C ABI smoke call.
4. `EntitlementManager.canStartTurn()` uses Rust first with safe fallback.

### Gate B (Phase 2 complete)
1. Skill prompt fixture parity passes for selected corpus.
2. No known regression in skill activation and stage progression behavior.
3. FFI compose-prompt parity test passes against shared skills fixture.

### Gate C (Phase 3 complete)
1. Realtime replay suite passes across representative traces.
2. No known regression in turn lifecycle boundaries.

### Gate D (Phase 4 complete)
1. Windows and Linux shells pass baseline smoke tests.
2. Shared core decisions are observable in shell logs/traces.

### Gate E (Phase 5 complete)
1. Platform adapter capabilities function in defined support matrix.
2. Capability fallback behavior is explicit and user-safe.

### Gate F (Phase 6 complete)
1. `cargo test -p skilly-core-mobile-sdk` passes.
2. `./scripts/generate-mobile-sdk-bindings.sh` generates Swift + Kotlin bindings without errors.
3. `./scripts/validate-mobile-sdk-consumers.sh` passes (Kotlin/JVM runtime + macOS Swift runtime lanes).

## Required CI Jobs
1. `rust-core-check`: `cargo check`
2. `rust-core-test`: `cargo test`
3. `ffi-smoke`: C ABI smoke test against built dylib
4. `shell-smoke`: windows/linux bootstrap smoke flow
5. `mac-release-guard`: verify release script preconditions and static checks
6. `mobile-sdk-bindings`: verify UniFFI binding generation command and artifacts
7. `mobile-sdk-consumer-validation`: run generated binding runtime validation against sample consumers
8. `mobile-sdk-artifacts`: build/package/publish mobile SDK + Rust FFI release artifacts

## Known Gaps
1. No terminal `xcodebuild` execution in this repo by policy.
2. Swift bridge compile/runtime validation must be completed inside Xcode workflow.
3. End-to-end native host-app runtime validation across Windows/Linux compositor/audio environments remains pending beyond CLI shell binaries.
4. iOS/Android full simulator/device host-app runtime validation remains required beyond CLI/JVM sample lanes.
