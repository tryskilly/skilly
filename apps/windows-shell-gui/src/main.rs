//! Skilly Windows host app (Tauri 2) — Phase 7 entry point.
//!
//! This crate hosts the user-facing Windows GUI app. Adapter trait
//! definitions and stub implementations live in `skilly_windows_shell`
//! (`apps/windows-shell`); this crate consumes the same trait surface so the
//! host code path is identical between dev (env-var stubs) and production
//! (real Windows-specific adapter implementations, landing in subsequent
//! commits behind `#[cfg(target_os = "windows")]` modules).
//!
//! Scope and roadmap: docs/architecture/phase-7-windows-shell-prd.md

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::Serialize;
use skilly_windows_shell::{
    stub::StubPlatformAdapters, AdapterCapabilityStatus, PlatformAdapters,
    PlatformCapabilitySnapshot,
};

#[derive(Debug, Serialize)]
struct CapabilityWireStatus {
    status: &'static str,
    reason: Option<String>,
}

impl From<&AdapterCapabilityStatus> for CapabilityWireStatus {
    fn from(adapter_capability_status: &AdapterCapabilityStatus) -> Self {
        match adapter_capability_status {
            AdapterCapabilityStatus::Available => CapabilityWireStatus {
                status: "available",
                reason: None,
            },
            AdapterCapabilityStatus::Degraded { reason } => CapabilityWireStatus {
                status: "degraded",
                reason: Some(reason.clone()),
            },
            AdapterCapabilityStatus::Unavailable { reason } => CapabilityWireStatus {
                status: "unavailable",
                reason: Some(reason.clone()),
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct CapabilitySnapshotPayload {
    capture: CapabilityWireStatus,
    hotkey: CapabilityWireStatus,
    overlay: CapabilityWireStatus,
    audio_input: CapabilityWireStatus,
    audio_output: CapabilityWireStatus,
    permissions: CapabilityWireStatus,
    critical_blockers: Vec<String>,
}

impl From<&PlatformCapabilitySnapshot> for CapabilitySnapshotPayload {
    fn from(platform_capability_snapshot: &PlatformCapabilitySnapshot) -> Self {
        CapabilitySnapshotPayload {
            capture: (&platform_capability_snapshot.capture).into(),
            hotkey: (&platform_capability_snapshot.hotkey).into(),
            overlay: (&platform_capability_snapshot.overlay).into(),
            audio_input: (&platform_capability_snapshot.audio_input).into(),
            audio_output: (&platform_capability_snapshot.audio_output).into(),
            permissions: (&platform_capability_snapshot.permissions).into(),
            critical_blockers: platform_capability_snapshot.critical_blockers(),
        }
    }
}

#[tauri::command]
fn capability_snapshot() -> CapabilitySnapshotPayload {
    let adapters = StubPlatformAdapters::new();
    let snapshot = adapters.capability_snapshot();
    (&snapshot).into()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![capability_snapshot])
        .run(tauri::generate_context!())
        .expect("failed to launch Skilly Windows host app");
}
