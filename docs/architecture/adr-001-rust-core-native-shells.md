# ADR-001: Adopt Rust Core + Native Platform Shells

## Status
Accepted

## Date
2026-04-16

## Decision
Adopt a shared Rust core for deterministic logic (policy, skills, orchestration) while keeping native UI/capability shells per platform.

## Drivers
1. Reduce logic duplication across future desktop/mobile clients.
2. Preserve platform-specific performance and capability integrations.
3. Minimize release risk by incrementally migrating from existing macOS host.

## Alternatives Considered
1. Full cross-platform UI rewrite first.
- Rejected because it introduces high migration risk and delays policy/orchestration reuse.

2. Keep all logic inside each platform shell.
- Rejected because policy/orchestration drift and maintenance cost increase over time.

3. Backend-only policy with thin clients.
- Rejected because core turn orchestration and offline-ish local behavior still require deterministic client logic.

## Consequences
1. FFI/versioning contracts become a first-class maintenance concern.
2. Platform shell teams remain responsible for native capture/hotkey/overlay behavior.
3. Migration can proceed in phases with fallback paths to keep shipping continuity.

## Follow-ups
1. Keep ABI mapping docs in sync between Rust and Swift.
2. Expand fixture-driven parity tests as new modules move to Rust.
3. Define Linux desktop environment support scope before adapter phase.

