//! Skilly Windows host app (Tauri 2) — Phase 7 entry point.
//!
//! This crate hosts the user-facing Windows GUI app. The sibling crate
//! `apps/windows-shell` provides the adapter trait surface, the env-var-driven
//! stub implementations, and the CLI smoke binary that gates CI. This crate
//! consumes the same trait surface so adapters can be swapped between stubs
//! (development on macOS/Linux dev machines) and real Windows implementations
//! (production builds) without changing the host code path.
//!
//! Tauri integration lands in the next commit; today this binary just renders
//! the current capability snapshot from the stub adapters as a sanity check.
//!
//! Scope and roadmap: docs/architecture/phase-7-windows-shell-prd.md

use skilly_windows_shell::{stub::StubPlatformAdapters, PlatformAdapters};

fn main() {
    let adapters = StubPlatformAdapters::new();
    let capability_snapshot = adapters.capability_snapshot();
    let critical_blockers = capability_snapshot.critical_blockers();

    println!(
        "skilly-windows-shell-gui placeholder — Tauri integration pending (see docs/architecture/phase-7-windows-shell-prd.md)"
    );
    println!(
        "stub capability snapshot: capture={:?} hotkey={:?} overlay={:?} audio_in={:?} audio_out={:?} permissions={:?}",
        capability_snapshot.capture,
        capability_snapshot.hotkey,
        capability_snapshot.overlay,
        capability_snapshot.audio_input,
        capability_snapshot.audio_output,
        capability_snapshot.permissions
    );

    if critical_blockers.is_empty() {
        println!("no critical blockers — adapter wiring healthy");
    } else {
        println!("critical blockers: {}", critical_blockers.join("; "));
    }
}
