//! Skilly Windows host app (Tauri 2) — Phase 7 entry point.
//!
//! This crate hosts the user-facing Windows GUI app. The sibling crate
//! `apps/windows-shell` continues to provide the CLI smoke binary that gates CI.
//! Real platform adapters (capture / hotkey / overlay / audio / auth) will live
//! here and replace the env-var stubs from the smoke binary as they are built.
//!
//! Scope and roadmap: docs/architecture/phase-7-windows-shell-prd.md

fn main() {
    println!(
        "skilly-windows-shell-gui placeholder — Tauri integration pending (see docs/architecture/phase-7-windows-shell-prd.md)"
    );
}
