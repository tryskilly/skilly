//! Linux native shell bootstrap with platform adapter contracts.

use skilly_core_domain::{EntitlementState, PolicyConfig, PolicyInput};
use skilly_core_policy::can_start_turn;
use skilly_core_realtime::{replay_events, RealtimeEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
enum AdapterCapabilityStatus {
    Available,
    Degraded { reason: String },
    Unavailable { reason: String },
}

#[derive(Debug, Clone)]
struct PlatformCapabilitySnapshot {
    capture: AdapterCapabilityStatus,
    hotkey: AdapterCapabilityStatus,
    overlay: AdapterCapabilityStatus,
    audio_input: AdapterCapabilityStatus,
    audio_output: AdapterCapabilityStatus,
    permissions: AdapterCapabilityStatus,
}

impl PlatformCapabilitySnapshot {
    fn critical_blockers(&self) -> Vec<String> {
        [
            ("capture", &self.capture),
            ("hotkey", &self.hotkey),
            ("overlay", &self.overlay),
            ("permissions", &self.permissions),
        ]
        .iter()
        .filter_map(
            |(adapter_name, capability_status)| match capability_status {
                AdapterCapabilityStatus::Unavailable { reason } => {
                    Some(format!("{adapter_name} unavailable: {reason}"))
                }
                _ => None,
            },
        )
        .collect()
    }
}

#[derive(Debug, Clone)]
struct AuthSession {
    workos_user_id: String,
    session_token: String,
}

#[derive(Debug)]
struct LinuxCaptureAdapter;

#[derive(Debug)]
struct LinuxHotkeyAdapter;

#[derive(Debug)]
struct LinuxOverlayAdapter;

#[derive(Debug)]
struct LinuxAudioAdapter;

#[derive(Debug)]
struct LinuxPermissionAdapter;

fn map_linux_capture_mode(capture_mode: &str, session_type: &str) -> AdapterCapabilityStatus {
    if capture_mode == "disabled" {
        return AdapterCapabilityStatus::Unavailable {
            reason: "SKILLY_LINUX_CAPTURE_MODE=disabled".to_string(),
        };
    }

    match session_type {
        "x11" => AdapterCapabilityStatus::Available,
        "wayland" => AdapterCapabilityStatus::Degraded {
            reason: "Wayland capture depends on portal availability".to_string(),
        },
        _ => AdapterCapabilityStatus::Degraded {
            reason: "capture session type unknown; runtime probing required".to_string(),
        },
    }
}

fn map_linux_hotkey_mode(
    hotkey_mode: &str,
    has_wayland_display: bool,
    has_x11_display: bool,
) -> AdapterCapabilityStatus {
    if hotkey_mode == "disabled" {
        return AdapterCapabilityStatus::Unavailable {
            reason: "SKILLY_LINUX_HOTKEY_MODE=disabled".to_string(),
        };
    }

    if has_x11_display {
        return AdapterCapabilityStatus::Available;
    }
    if has_wayland_display {
        return AdapterCapabilityStatus::Degraded {
            reason: "Wayland global hotkeys depend on compositor support".to_string(),
        };
    }

    AdapterCapabilityStatus::Degraded {
        reason: "hotkey display context missing; runtime probing required".to_string(),
    }
}

fn map_linux_overlay_mode(
    overlay_mode: &str,
    has_wayland_display: bool,
    has_x11_display: bool,
) -> AdapterCapabilityStatus {
    if overlay_mode == "disabled" {
        return AdapterCapabilityStatus::Unavailable {
            reason: "SKILLY_LINUX_OVERLAY_MODE=disabled".to_string(),
        };
    }

    if has_x11_display {
        return AdapterCapabilityStatus::Available;
    }
    if has_wayland_display {
        return AdapterCapabilityStatus::Degraded {
            reason: "Wayland overlays depend on compositor protocol support".to_string(),
        };
    }

    AdapterCapabilityStatus::Degraded {
        reason: "overlay display context missing; runtime probing required".to_string(),
    }
}

fn map_linux_audio_input(
    has_pulse_server: bool,
    has_pipewire_runtime_directory: bool,
) -> AdapterCapabilityStatus {
    if has_pulse_server || has_pipewire_runtime_directory {
        return AdapterCapabilityStatus::Available;
    }
    AdapterCapabilityStatus::Degraded {
        reason: "audio server variables not detected; runtime probing required".to_string(),
    }
}

fn map_linux_audio_output(
    has_pulse_server: bool,
    has_pipewire_runtime_directory: bool,
) -> AdapterCapabilityStatus {
    if has_pulse_server || has_pipewire_runtime_directory {
        return AdapterCapabilityStatus::Available;
    }
    AdapterCapabilityStatus::Degraded {
        reason: "audio server variables not detected; runtime probing required".to_string(),
    }
}

fn map_linux_permission_state(permission_state: &str) -> AdapterCapabilityStatus {
    if permission_state == "blocked" {
        return AdapterCapabilityStatus::Unavailable {
            reason: "SKILLY_LINUX_PERMISSION_STATE=blocked".to_string(),
        };
    }
    AdapterCapabilityStatus::Available
}

fn entitlement_state_from_raw(entitlement_state_raw: &str) -> EntitlementState {
    match entitlement_state_raw {
        "none" => EntitlementState::None,
        "trial" => EntitlementState::Trial,
        "active" => EntitlementState::Active,
        "canceled-valid" => EntitlementState::Canceled {
            access_still_valid: true,
        },
        "canceled-expired" => EntitlementState::Canceled {
            access_still_valid: false,
        },
        "expired" => EntitlementState::Expired,
        _ => EntitlementState::Active,
    }
}

impl LinuxCaptureAdapter {
    fn capability(&self) -> AdapterCapabilityStatus {
        let capture_mode = std::env::var("SKILLY_LINUX_CAPTURE_MODE")
            .unwrap_or_else(|_| "auto".to_string())
            .to_lowercase();
        let session_type = std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_else(|_| "unknown".to_string())
            .to_lowercase();
        map_linux_capture_mode(&capture_mode, &session_type)
    }
}

impl LinuxHotkeyAdapter {
    fn capability(&self) -> AdapterCapabilityStatus {
        let hotkey_mode = std::env::var("SKILLY_LINUX_HOTKEY_MODE")
            .unwrap_or_else(|_| "auto".to_string())
            .to_lowercase();
        let has_wayland_display = std::env::var("WAYLAND_DISPLAY").is_ok();
        let has_x11_display = std::env::var("DISPLAY").is_ok();
        map_linux_hotkey_mode(&hotkey_mode, has_wayland_display, has_x11_display)
    }
}

impl LinuxOverlayAdapter {
    fn capability(&self) -> AdapterCapabilityStatus {
        let overlay_mode = std::env::var("SKILLY_LINUX_OVERLAY_MODE")
            .unwrap_or_else(|_| "auto".to_string())
            .to_lowercase();
        let has_wayland_display = std::env::var("WAYLAND_DISPLAY").is_ok();
        let has_x11_display = std::env::var("DISPLAY").is_ok();
        map_linux_overlay_mode(&overlay_mode, has_wayland_display, has_x11_display)
    }
}

impl LinuxAudioAdapter {
    fn input_capability(&self) -> AdapterCapabilityStatus {
        map_linux_audio_input(
            std::env::var("PULSE_SERVER").is_ok(),
            std::env::var("PIPEWIRE_RUNTIME_DIR").is_ok(),
        )
    }

    fn output_capability(&self) -> AdapterCapabilityStatus {
        map_linux_audio_output(
            std::env::var("PULSE_SERVER").is_ok(),
            std::env::var("PIPEWIRE_RUNTIME_DIR").is_ok(),
        )
    }
}

impl LinuxPermissionAdapter {
    fn capability(&self) -> AdapterCapabilityStatus {
        let permission_state = std::env::var("SKILLY_LINUX_PERMISSION_STATE")
            .unwrap_or_else(|_| "granted".to_string())
            .to_lowercase();
        map_linux_permission_state(&permission_state)
    }
}

#[derive(Debug)]
struct LinuxPlatformAdapters {
    capture: LinuxCaptureAdapter,
    hotkey: LinuxHotkeyAdapter,
    overlay: LinuxOverlayAdapter,
    audio: LinuxAudioAdapter,
    permissions: LinuxPermissionAdapter,
}

impl LinuxPlatformAdapters {
    fn new() -> Self {
        Self {
            capture: LinuxCaptureAdapter,
            hotkey: LinuxHotkeyAdapter,
            overlay: LinuxOverlayAdapter,
            audio: LinuxAudioAdapter,
            permissions: LinuxPermissionAdapter,
        }
    }

    fn capability_snapshot(&self) -> PlatformCapabilitySnapshot {
        PlatformCapabilitySnapshot {
            capture: self.capture.capability(),
            hotkey: self.hotkey.capability(),
            overlay: self.overlay.capability(),
            audio_input: self.audio.input_capability(),
            audio_output: self.audio.output_capability(),
            permissions: self.permissions.capability(),
        }
    }
}

#[derive(Debug)]
struct ShellTurnFlowResult {
    auth_user_id: String,
    entitlement_state: EntitlementState,
    allowed_to_start_turn: bool,
    final_phase: String,
    turns_completed: u64,
    capability_snapshot: PlatformCapabilitySnapshot,
}

fn load_auth_session() -> Result<AuthSession, String> {
    let workos_user_id = std::env::var("SKILLY_LINUX_WORKOS_USER_ID")
        .unwrap_or_else(|_| "linux-dev-user".to_string());
    let session_token = std::env::var("SKILLY_LINUX_SESSION_TOKEN")
        .unwrap_or_else(|_| "linux-session-token".to_string());

    if session_token.trim().is_empty() {
        return Err("linux session token is empty".to_string());
    }

    Ok(AuthSession {
        workos_user_id,
        session_token,
    })
}

fn resolve_entitlement_state() -> EntitlementState {
    let entitlement_state_raw = std::env::var("SKILLY_LINUX_ENTITLEMENT_STATUS")
        .unwrap_or_else(|_| "active".to_string())
        .to_lowercase();
    entitlement_state_from_raw(&entitlement_state_raw)
}

fn run_turn_flow() -> Result<ShellTurnFlowResult, String> {
    let auth_session = load_auth_session()?;
    if auth_session.session_token.len() < 8 {
        return Err("linux session token is too short".to_string());
    }
    let platform_adapters = LinuxPlatformAdapters::new();
    let capability_snapshot = platform_adapters.capability_snapshot();
    let critical_blockers = capability_snapshot.critical_blockers();
    if !critical_blockers.is_empty() {
        return Err(format!(
            "linux shell capability blockers: {}",
            critical_blockers.join("; ")
        ));
    }

    let entitlement_state = resolve_entitlement_state();
    let policy_input = PolicyInput {
        user_id: Some(auth_session.workos_user_id.clone()),
        entitlement_state: entitlement_state.clone(),
        trial_seconds_used: std::env::var("SKILLY_LINUX_TRIAL_SECONDS_USED")
            .ok()
            .and_then(|raw_value| raw_value.parse::<u64>().ok())
            .unwrap_or(0),
        usage_seconds_used: std::env::var("SKILLY_LINUX_USAGE_SECONDS_USED")
            .ok()
            .and_then(|raw_value| raw_value.parse::<u64>().ok())
            .unwrap_or(0),
    };

    let policy_decision = can_start_turn(&PolicyConfig::default(), &policy_input);
    if !policy_decision.allowed {
        return Err("policy blocked turn start".to_string());
    }

    let events = vec![
        RealtimeEvent::TurnStarted {
            turn_id: "linux-turn-1".to_string(),
        },
        RealtimeEvent::AudioCaptureCommitted {
            turn_id: "linux-turn-1".to_string(),
        },
        RealtimeEvent::AudioPlaybackStarted {
            turn_id: "linux-turn-1".to_string(),
        },
        RealtimeEvent::ResponseCompleted {
            turn_id: "linux-turn-1".to_string(),
        },
    ];
    let final_state = replay_events(&events)
        .map_err(|replay_error| format!("replay failed: {replay_error:?}"))?;

    Ok(ShellTurnFlowResult {
        auth_user_id: auth_session.workos_user_id,
        entitlement_state,
        allowed_to_start_turn: policy_decision.allowed,
        final_phase: final_state.phase_name().to_string(),
        turns_completed: final_state.turns_completed,
        capability_snapshot,
    })
}

fn main() {
    let smoke_requested = std::env::args().any(|argument| argument == "--smoke");
    if !smoke_requested {
        println!("skilly-linux-shell adapters ready (use --smoke)");
        return;
    }

    match run_turn_flow() {
        Ok(flow_result) => {
            println!(
                "linux shell flow passed: user={} entitlement={:?} allowed={} phase={} turns_completed={} capture={:?} hotkey={:?} overlay={:?} audio_in={:?} audio_out={:?} permissions={:?}",
                flow_result.auth_user_id,
                flow_result.entitlement_state,
                flow_result.allowed_to_start_turn,
                flow_result.final_phase,
                flow_result.turns_completed,
                flow_result.capability_snapshot.capture,
                flow_result.capability_snapshot.hotkey,
                flow_result.capability_snapshot.overlay,
                flow_result.capability_snapshot.audio_input,
                flow_result.capability_snapshot.audio_output,
                flow_result.capability_snapshot.permissions
            );
        }
        Err(error_message) => {
            eprintln!("linux shell flow failed: {error_message}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_capture_mode_uses_degraded_for_unknown_session() {
        assert!(matches!(
            map_linux_capture_mode("auto", "unknown"),
            AdapterCapabilityStatus::Degraded { .. }
        ));
        assert!(matches!(
            map_linux_capture_mode("disabled", "x11"),
            AdapterCapabilityStatus::Unavailable { .. }
        ));
    }

    #[test]
    fn linux_overlay_mode_respects_disable_override() {
        assert!(matches!(
            map_linux_overlay_mode("disabled", false, true),
            AdapterCapabilityStatus::Unavailable { .. }
        ));
        assert!(matches!(
            map_linux_overlay_mode("auto", true, false),
            AdapterCapabilityStatus::Degraded { .. }
        ));
    }

    #[test]
    fn linux_entitlement_parser_handles_known_values() {
        assert!(matches!(
            entitlement_state_from_raw("trial"),
            EntitlementState::Trial
        ));
        assert!(matches!(
            entitlement_state_from_raw("canceled-expired"),
            EntitlementState::Canceled {
                access_still_valid: false
            }
        ));
        assert!(matches!(
            entitlement_state_from_raw("unknown"),
            EntitlementState::Active
        ));
    }

    #[test]
    fn critical_blockers_only_include_unavailable_capabilities() {
        let snapshot = PlatformCapabilitySnapshot {
            capture: AdapterCapabilityStatus::Degraded {
                reason: "fallback".to_string(),
            },
            hotkey: AdapterCapabilityStatus::Unavailable {
                reason: "blocked".to_string(),
            },
            overlay: AdapterCapabilityStatus::Available,
            audio_input: AdapterCapabilityStatus::Available,
            audio_output: AdapterCapabilityStatus::Available,
            permissions: AdapterCapabilityStatus::Unavailable {
                reason: "policy".to_string(),
            },
        };

        let blockers = snapshot.critical_blockers();
        assert_eq!(blockers.len(), 2);
        assert!(blockers
            .iter()
            .any(|entry| entry.contains("hotkey unavailable")));
        assert!(blockers
            .iter()
            .any(|entry| entry.contains("permissions unavailable")));
    }
}
