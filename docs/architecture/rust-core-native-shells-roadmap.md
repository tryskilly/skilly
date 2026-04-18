# Roadmap: Rust Core + Native Shells

## Phase Tracker

| Phase | Name | Status | Exit Criteria |
| --- | --- | --- | --- |
| 0 | Baseline + Safety Rails | Complete | Boundaries/capability docs + core scaffold + initial fixtures |
| 1 | Policy Core Extraction | Complete | Entitlement gate uses Rust bridge with safe fallback |
| 2 | Skill Prompt Core Extraction | Complete | Skill composition parity fixtures pass on Rust path |
| 3 | Realtime Orchestration Extraction | Complete | Session lifecycle replay suite passes on Rust path |
| 4 | Windows/Linux Shell Bootstrap | Complete | Both shells run auth + entitlement + turn-start smoke flow |
| 5 | Real Platform Adapters | Complete (Dev) | Capture/hotkey/overlay baseline adapter contracts wired with capability-aware gating |
| 6 | Mobile SDK Surface | Planned | Swift/Kotlin SDK bindings and sample integrations available |

## Detailed Phases

### Phase 0: Baseline + Safety Rails
Completed:
- core boundaries documented
- capability matrix documented
- adapter contracts documented
- Rust workspace scaffolded (`core/domain`, `core/policy`, `core/skills`, `core/realtime`, `core/ffi`)
- policy fixtures and baseline tests added

Remaining:
- Expand fixture set with additional production-like session traces
- Execute parity harness runs in Xcode and publish evidence snapshots

### Phase 1: Policy Core Extraction
Completed:
- Rust policy engine implements can-start-turn decisions
- C ABI entrypoint exposed from `core/ffi`
- Swift `EntitlementManager.canStartTurn()` calls Rust first with Swift fallback
- `TrialTracker` and `UsageTracker` checks route through Rust policy bridge

Remaining:
- Add Xcode-run integration tests around fallback behavior and bridge availability
- Implement packaged dylib distribution path after runtime parity is proven

### Phase 2: Skill Prompt Core Extraction
Completed:
1. Mirrored skill metadata and prompt composer contracts in `core/skills`.
2. Added fixture-driven parity tests for prompt composition.
3. Routed Swift `SkillPromptComposer` generation through Rust bridge with fallback.
4. Added FFI-level compose prompt parity test in `core/ffi`.

Exit Criteria:
- Rust prompt outputs match current expected outputs for agreed fixture corpus.

### Phase 3: Realtime Orchestration Extraction
Completed:
1. Added canonical turn/session state machine in `core/realtime`.
2. Added replay harness with fixture-driven traces.
3. Added `RustRealtimeBridge` and routed Swift `CompanionManager` turn lifecycle events through Rust replay transitions.

Remaining:
1. Add replay traces from production telemetry samples.

Tasks:
1. Define canonical turn/session state machine in `core/realtime`.
2. Add replay harness for event sequence validation.
3. Move Swift orchestration decisions into Rust.

Exit Criteria:
- Replay suite passes and no known regression in core turn lifecycle behavior.

### Phase 4: Windows/Linux Shell Bootstrap
Completed:
1. Created shell bootstrap crates (`apps/windows-shell`, `apps/linux-shell`).
2. Implemented mocked auth + entitlement + turn-start smoke flows using shared core.
3. Added CI shell smoke runs on Ubuntu and Windows runners.
4. Wired shell bootstrap binaries to explicit platform adapter contracts for auth, entitlement, capture, hotkey, overlay, audio, and permissions.

Remaining:
1. Final-phase runtime validation in native host shells.

Tasks:
1. Create shell skeletons and bridge wiring.
2. Implement auth + entitlement + turn-start baseline.
3. Add per-platform smoke tests.

Exit Criteria:
- Shell apps can complete baseline flow with shared core logic.

### Phase 5: Real Platform Adapters
Completed:
1. Added Windows capture/hotkey/overlay/audio/permission adapter modules with capability contract outputs.
2. Added Linux capture/hotkey/overlay/audio/permission adapter modules with session-aware capability contract outputs.
3. Added capability-aware turn-start gating with explicit blocker reporting for unavailable critical adapters.
4. Removed mocked-only shell flow by routing both shells through adapter-backed execution path.

Remaining:
1. Execute final-phase runtime validation on real platform environments (Windows + Linux compositor/audio variants).

Exit Criteria:
- Baseline interactive behavior available on supported platform scope.

### Phase 6: Mobile SDK Surface
Tasks:
1. Expose selected core APIs via UniFFI.
2. Generate Swift/Kotlin SDK packages.
3. Add sample integration apps.

Exit Criteria:
- SDK consumers can run policy + selected orchestration flows using shared core.

## Dependency Graph
1. Phase 0 and 1 are prerequisites for all later phases.
2. Phase 2 and 3 can run in parallel after policy contracts stabilize.
3. Phase 4 depends on stable FFI contracts from phases 1-3.
4. Phase 5 depends on platform shell bootstrap readiness.
5. Phase 6 depends on stable domain/policy/realtime public contracts.

## Delivery Cadence
1. Phase branches merged independently behind safe fallback paths.
2. Every phase requires:
- explicit acceptance criteria check
- documented risks + mitigation updates
- release impact assessment for macOS pipeline
