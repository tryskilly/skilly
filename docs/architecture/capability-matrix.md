# Capability Matrix

Status key:
- `ready`: implemented in current host
- `planned`: defined in migration plan, not yet implemented
- `unknown`: requires discovery spike

| Capability | macOS (current Swift host) | Windows shell target | Linux shell target | Rust core role |
| --- | --- | --- | --- | --- |
| Auth session lifecycle | ready | planned | planned | shared contracts + validation |
| Entitlement checks | ready | planned | planned | deterministic policy engine |
| Trial/cap accounting | ready | planned | planned | deterministic transitions |
| Admin allowlist policy | ready | planned | planned | stable WorkOS-user-id decision path |
| Realtime orchestration | ready | planned | planned | shared state machine |
| Prompt composition | ready | planned | planned | shared skill/prompt module |
| Screen capture | ready | planned | planned | capability flag + result normalization |
| Global push-to-talk hotkey | ready | planned | planned | capability flag + event contracts |
| Overlay pointing UI | ready | planned | planned | event contracts only |
| App update channel | ready | planned | planned | release metadata conventions |

## Notes
- Capture, hotkey, and overlay stay native because they depend on OS-specific primitives.
- Rust core should only define contracts, state transitions, and deterministic behavior.
- Platform adapters should report capability availability so UX can degrade gracefully.

