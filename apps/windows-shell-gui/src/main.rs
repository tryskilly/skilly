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
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "windows")]
use tauri::Emitter;

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

#[derive(Debug, Default, PartialEq, Eq)]
struct ModifierChordState {
    active: bool,
}

static PUSH_TO_TALK_ACTIVE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn push_to_talk_active() -> bool {
    PUSH_TO_TALK_ACTIVE.load(Ordering::Relaxed)
}

#[derive(Debug, PartialEq, Eq)]
enum ModifierChordTransition {
    Pressed,
    Released,
}

impl ModifierChordState {
    fn update(&mut self, control_down: bool, alt_down: bool) -> Option<ModifierChordTransition> {
        let next_active = control_down && alt_down;
        if next_active == self.active {
            return None;
        }

        self.active = next_active;
        Some(if next_active {
            ModifierChordTransition::Pressed
        } else {
            ModifierChordTransition::Released
        })
    }
}

#[cfg(target_os = "windows")]
fn start_push_to_talk_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        const VK_CONTROL: i32 = 0x11;
        const VK_MENU: i32 = 0x12;

        #[link(name = "user32")]
        extern "system" {
            fn GetAsyncKeyState(virtual_key: i32) -> i16;
        }

        fn is_key_down(virtual_key: i32) -> bool {
            // The high bit is set while the key is currently held.
            unsafe { GetAsyncKeyState(virtual_key) < 0 }
        }

        let mut chord_state = ModifierChordState::default();
        loop {
            let transition = chord_state.update(is_key_down(VK_CONTROL), is_key_down(VK_MENU));
            match transition {
                Some(ModifierChordTransition::Pressed) => {
                    PUSH_TO_TALK_ACTIVE.store(true, Ordering::Relaxed);
                    let _ = app_handle.emit("push_to_talk_pressed", ());
                }
                Some(ModifierChordTransition::Released) => {
                    PUSH_TO_TALK_ACTIVE.store(false, Ordering::Relaxed);
                    let _ = app_handle.emit("push_to_talk_released", ());
                }
                None => {}
            }
            std::thread::sleep(std::time::Duration::from_millis(12));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "windows")]
            start_push_to_talk_listener(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capability_snapshot,
            push_to_talk_active
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch Skilly Windows host app");
}

#[cfg(test)]
mod tests {
    use super::{ModifierChordState, ModifierChordTransition};

    #[test]
    fn modifier_chord_emits_only_on_press_and_release_edges() {
        let mut state = ModifierChordState::default();

        assert_eq!(state.update(false, false), None);
        assert_eq!(state.update(true, false), None);
        assert_eq!(
            state.update(true, true),
            Some(ModifierChordTransition::Pressed)
        );
        assert_eq!(state.update(true, true), None);
        assert_eq!(
            state.update(false, true),
            Some(ModifierChordTransition::Released)
        );
        assert_eq!(state.update(false, false), None);
    }
}
