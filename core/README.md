# Core Workspace

This directory contains the shared Rust core for Skilly's multi-platform architecture.

Crates:
- `domain`: Shared data types and state contracts.
- `policy`: Entitlement, trial, cap, and admin decision logic.
- `skills`: Shared prompt composition logic and vocabulary trimming.
- `realtime`: Shared deterministic realtime turn/session state machine and replay harness.
- `ffi`: Stable bridge surface intended for native platform shells.

This scaffold is intentionally minimal and designed for iterative adoption from the current macOS Swift host.

## Local Development

```bash
# From repo root
source "$HOME/.cargo/env"
cargo check
cargo test
cargo build -p skilly-core-ffi
```

The bridge dylib is generated at:
- `target/debug/libskilly_core_ffi.dylib`

Bootstrap shell binaries live under:
- `apps/windows-shell`
- `apps/linux-shell`

To force the macOS app to load a specific Rust dylib during development,
set one of these environment variables in your Xcode scheme:
- `SKILLY_RUST_POLICY_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`
- `SKILLY_RUST_SKILLS_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`
- `SKILLY_RUST_CORE_DYLIB_PATH=/absolute/path/to/libskilly_core_ffi.dylib`
