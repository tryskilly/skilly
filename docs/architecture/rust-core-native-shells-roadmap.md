# Roadmap: Rust Core + Native Shells

## Phase Tracker

| Phase | Name | Status | Exit Criteria |
| --- | --- | --- | --- |
| 0 | Baseline + Safety Rails | In Progress | Boundaries/capability docs + core scaffold + initial fixtures |
| 1 | Policy Core Extraction | In Progress | Entitlement gate uses Rust bridge with safe fallback |
| 2 | Skill Prompt Core Extraction | Planned | Skill composition parity fixtures pass on Rust path |
| 3 | Realtime Orchestration Extraction | Planned | Session lifecycle replay suite passes on Rust path |
| 4 | Windows/Linux Shell Bootstrap | Planned | Both shells run auth + entitlement + turn-start smoke flow |
| 5 | Real Platform Adapters | Planned | Capture/hotkey/overlay baseline works per platform scope |
| 6 | Mobile SDK Surface | Planned | Swift/Kotlin SDK bindings and sample integrations available |

## Detailed Phases

### Phase 0: Baseline + Safety Rails
Completed:
- core boundaries documented
- capability matrix documented
- Rust workspace scaffolded (`core/domain`, `core/policy`, `core/ffi`)
- policy fixtures and baseline tests added

Remaining:
- Expand fixture set from current production-like scenarios
- Add baseline parity harness docs for Swift vs Rust decisions

### Phase 1: Policy Core Extraction
Completed:
- Rust policy engine implements can-start-turn decisions
- C ABI entrypoint exposed from `core/ffi`
- Swift `EntitlementManager.canStartTurn()` calls Rust first with Swift fallback

Remaining:
- Move `TrialTracker` and `UsageTracker` blocking decisions through shared policy outputs
- Add integration tests around fallback behavior and bridge availability
- Decide long-term dylib packaging strategy for Xcode workflows

### Phase 2: Skill Prompt Core Extraction
Tasks:
1. Mirror current skill metadata and prompt composer contracts in `core/skills`.
2. Add fixtures from existing skill prompt outputs.
3. Route Swift `SkillManager` prompt generation through Rust bridge with fallback.

Exit Criteria:
- Rust prompt outputs match current expected outputs for agreed fixture corpus.

### Phase 3: Realtime Orchestration Extraction
Tasks:
1. Define canonical turn/session state machine in `core/realtime`.
2. Add replay harness for event sequence validation.
3. Move Swift orchestration decisions into Rust.

Exit Criteria:
- Replay suite passes and no known regression in core turn lifecycle behavior.

### Phase 4: Windows/Linux Shell Bootstrap
Tasks:
1. Create shell skeletons and bridge wiring.
2. Implement auth + entitlement + turn-start baseline.
3. Add per-platform smoke tests.

Exit Criteria:
- Shell apps can complete baseline flow with shared core logic.

### Phase 5: Real Platform Adapters
Tasks:
1. Windows capture/hotkey/overlay adapters.
2. Linux capture/hotkey/overlay adapters.
3. Capability-aware UX handling for partial support.

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

