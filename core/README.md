# Core Workspace

This directory contains the shared Rust core for Skilly's multi-platform architecture.

Crates:
- `domain`: Shared data types and state contracts.
- `policy`: Entitlement, trial, cap, and admin decision logic.
- `ffi`: Stable bridge surface intended for native platform shells.

This scaffold is intentionally minimal and designed for iterative adoption from the current macOS Swift host.

