# Runtime Validation Report

Generated (UTC): 2026-04-18
Branch: `feature/skills-bridge-swift`
Commit: `9b47766`

Source template: `docs/architecture/runtime-validation-signoff-template.md`

## Signoff Metadata
- Owner:
- Reviewer:
- Validation date:
- Branch:
- Commit SHA:
- Build identifiers (if applicable):

## Decision
- Overall status: `approved` | `blocked`
- Blocking notes:
- Follow-up ticket(s):

## Required Runtime Lanes
| Lane | Status (`pass`/`fail`/`n-a`) | Evidence link (video/log/screenshot) | Notes |
| --- | --- | --- | --- |
| macOS host app (Rust lane via `SKILLY_RUST_CORE_DYLIB_PATH`) |  |  |  |
| macOS host app (Swift fallback lane; Rust dylib disabled) |  |  |  |
| macOS host app (packaged Rust FFI artifact consumed) |  |  |  |
| Windows native host app runtime (real desktop environment) |  |  |  |
| Linux native host app runtime (real desktop environment) |  |  |  |
| iOS host app simulator runtime (generated SDK integration) |  |  |  |
| Android host app emulator runtime (generated SDK integration) |  |  |  |

## Policy Scenario Parity (Rust lane vs Swift lane)
| Scenario | Rust lane result | Swift lane result | Match (`yes`/`no`) | Notes |
| --- | --- | --- | --- | --- |
| Trial under cap -> allowed |  |  |  |  |
| Trial exhausted -> blocked (`trialExhausted`) |  |  |  |  |
| Active under cap -> allowed |  |  |  |  |
| Active over cap -> blocked (`capReached`) |  |  |  |  |
| Admin over cap/expired -> allowed |  |  |  |  |
| Canceled valid access under cap -> allowed |  |  |  |  |
| Canceled valid access over cap -> blocked (`capReached`) |  |  |  |  |

## Skill Prompt Parity (Rust lane vs Swift lane)
| Scenario | Rust lane result | Swift lane result | Match (`yes`/`no`) | Notes |
| --- | --- | --- | --- | --- |
| Full vocabulary budget |  |  |  |  |
| Vocabulary trimming applied |  |  |  |  |
| Completed-stage history included |  |  |  |  |
| Missing-current-stage fallback |  |  |  |  |
| Pointing mode variants (`always`, `when-relevant`, `minimal`) |  |  |  |  |

## Realtime Lifecycle Parity (Rust lane vs Swift lane)
| Scenario | Rust lane result | Swift lane result | Match (`yes`/`no`) | Notes |
| --- | --- | --- | --- | --- |
| `turn_started -> audio_capture_committed -> audio_playback_started -> response_completed` |  |  |  |  |
| `turn_started -> audio_capture_committed -> session_error` |  |  |  |  |
| `completed -> session_reset` |  |  |  |  |
| Invalid ordering rejection (`turn_started -> response_completed`) |  |  |  |  |

## Windows/Linux Host-App Runtime Checklist
- Windows auth + entitlement + turn-start flow validated in native host app:
- Windows capture/hotkey/overlay/audio/permissions behavior validated:
- Linux auth + entitlement + turn-start flow validated in native host app:
- Linux capture/hotkey/overlay/audio/permissions behavior validated:
- Known platform-specific degradations documented:

## iOS/Android Host-App Runtime Checklist
- iOS host app compiles with generated Swift SDK:
- iOS runtime exercise of policy and realtime API completed:
- Android host app compiles with generated Kotlin SDK:
- Android runtime exercise of policy and realtime API completed:
- ABI/library loading behavior documented for both platforms:

## Packaged Artifact Consumption Checklist
- `dist/rust-ffi/*.tar.gz` unpack + load test executed:
- `dist/mobile-sdk/*.tar.gz` unpack + sample integration test executed:
- Checksum verification completed:

## Evidence Attachments
- Command transcript links:
- Screen recordings:
- Crash logs / diagnostics:
