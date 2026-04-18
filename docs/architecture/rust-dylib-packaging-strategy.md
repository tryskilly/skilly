# Rust Dylib Packaging Strategy (macOS Shell)

## Purpose
Define a deterministic strategy for building and loading `libskilly_core_ffi.dylib` in development and release workflows.

## Current State
- Bridges dynamically try env-var paths first, then local workspace build outputs:
  - `target/debug/libskilly_core_ffi.dylib`
  - `target/release/libskilly_core_ffi.dylib`
- Fallback to Swift logic is intentional when dylib is unavailable.

## Goals
1. Keep macOS app functional even when Rust library is missing.
2. Make Rust-enabled runs deterministic in Xcode and CI.
3. Avoid ad-hoc dylib path drift across developer machines.

## Development Strategy

### Local Build Command
From repo root:
```bash
cargo build -p skilly-core-ffi
```

### Xcode Scheme Environment
Prefer one canonical variable:
- `SKILLY_RUST_CORE_DYLIB_PATH=/absolute/path/to/target/debug/libskilly_core_ffi.dylib`

Backward-compatible vars remain supported:
- `SKILLY_RUST_POLICY_DYLIB_PATH`
- `SKILLY_RUST_SKILLS_DYLIB_PATH`
- `SKILLY_RUST_REALTIME_DYLIB_PATH`

### Expected Behavior
- If dylib exists at configured path: Rust bridge path is active.
- If dylib missing: bridge logs fallback and Swift path remains active.

## CI Strategy
CI should always validate Rust build artifacts separately from Xcode runtime:
1. `cargo build -p skilly-core-ffi`
2. `cargo test -p skilly-core-ffi`
3. `cargo check --workspace`

This guarantees ABI surfaces compile while keeping macOS GUI runtime tests outside terminal `xcodebuild`.

## Release Strategy (Current)
For release builds, keep Swift fallback as hard safety net.
Do not block app release solely on Rust dylib packaging until runtime parity is fully proven.

## Release Strategy (Target)
After parity is proven:
1. Add pre-release check that builds `skilly-core-ffi`.
2. Bundle dylib in app resources (or deterministic sidecar location).
3. Set runtime lookup path to bundled location first.
4. Keep fallback path behind runtime flag for rollback.

## Proposed Build-Phase Hook (Future)
Add optional Xcode "Run Script" phase for debug builds:
1. Run `cargo build -p skilly-core-ffi`.
2. Copy dylib to derived-data deterministic location.
3. Export `SKILLY_RUST_CORE_DYLIB_PATH` in scheme.

This is not mandatory yet; current env-var path approach is adequate during migration.

## Risk Controls
1. Never remove Swift fallback while migration phases remain incomplete.
2. Keep bridge symbols additive to avoid breaking older dylibs in local caches.
3. Version ABI via `skilly_policy_ffi_version()` and add equivalent version entrypoints for new surfaces as needed.

## Decision
Adopt env-var-first deterministic loading now, and defer packaged dylib distribution until post-parity release hardening.
