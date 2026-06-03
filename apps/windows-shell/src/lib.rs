//! Skilly Windows shell adapter contracts and stub implementations.
//!
//! This crate exposes:
//! - cross-platform adapter traits (Capture / Hotkey / Overlay / Audio / Permission)
//! - env-var-driven stub implementations used by the CI smoke binary
//! - the shared turn-flow harness that exercises auth + entitlement + replay
//!
//! Real Windows-specific adapter implementations will land here in subsequent
//! commits behind `#[cfg(target_os = "windows")]` modules. The GUI host crate
//! `apps/windows-shell-gui` consumes the same trait surface so adapters can be
//! swapped between stubs (dev) and real implementations (production) at the
//! shell boundary.

use skilly_core_domain::{EntitlementState, PolicyConfig, PolicyInput};
use skilly_core_policy::can_start_turn;
use skilly_core_realtime::{replay_events, RealtimeEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdapterCapabilityStatus {
    Available,
    Degraded { reason: String },
    Unavailable { reason: String },
}

#[derive(Debug, Clone)]
pub struct PlatformCapabilitySnapshot {
    pub capture: AdapterCapabilityStatus,
    pub hotkey: AdapterCapabilityStatus,
    pub overlay: AdapterCapabilityStatus,
    pub audio_input: AdapterCapabilityStatus,
    pub audio_output: AdapterCapabilityStatus,
    pub permissions: AdapterCapabilityStatus,
}

impl PlatformCapabilitySnapshot {
    pub fn critical_blockers(&self) -> Vec<String> {
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

pub trait CaptureAdapter {
    fn capability(&self) -> AdapterCapabilityStatus;
}

pub trait HotkeyAdapter {
    fn capability(&self) -> AdapterCapabilityStatus;
}

pub trait OverlayAdapter {
    fn capability(&self) -> AdapterCapabilityStatus;
}

pub trait AudioAdapter {
    fn input_capability(&self) -> AdapterCapabilityStatus;
    fn output_capability(&self) -> AdapterCapabilityStatus;
}

pub trait PermissionAdapter {
    fn capability(&self) -> AdapterCapabilityStatus;
}

pub trait PlatformAdapters {
    fn capability_snapshot(&self) -> PlatformCapabilitySnapshot;
}

#[derive(Debug, Clone)]
pub struct AuthSession {
    pub workos_user_id: String,
    pub session_token: String,
}

#[derive(Debug)]
pub struct ShellTurnFlowResult {
    pub auth_user_id: String,
    pub entitlement_state: EntitlementState,
    pub allowed_to_start_turn: bool,
    pub final_phase: String,
    pub turns_completed: u64,
    pub capability_snapshot: PlatformCapabilitySnapshot,
}

pub fn entitlement_state_from_raw(entitlement_state_raw: &str) -> EntitlementState {
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

pub fn load_auth_session_from_env() -> Result<AuthSession, String> {
    let workos_user_id = std::env::var("SKILLY_WINDOWS_WORKOS_USER_ID")
        .unwrap_or_else(|_| "windows-dev-user".to_string());
    let session_token = std::env::var("SKILLY_WINDOWS_SESSION_TOKEN")
        .unwrap_or_else(|_| "windows-session-token".to_string());

    if session_token.trim().is_empty() {
        return Err("windows session token is empty".to_string());
    }

    Ok(AuthSession {
        workos_user_id,
        session_token,
    })
}

pub fn resolve_entitlement_state_from_env() -> EntitlementState {
    let entitlement_state_raw = std::env::var("SKILLY_WINDOWS_ENTITLEMENT_STATUS")
        .unwrap_or_else(|_| "active".to_string())
        .to_lowercase();
    entitlement_state_from_raw(&entitlement_state_raw)
}

pub fn run_turn_flow<A: PlatformAdapters>(
    adapters: &A,
    auth_session: AuthSession,
    entitlement_state: EntitlementState,
) -> Result<ShellTurnFlowResult, String> {
    if auth_session.session_token.len() < 8 {
        return Err("windows session token is too short".to_string());
    }

    let capability_snapshot = adapters.capability_snapshot();
    let critical_blockers = capability_snapshot.critical_blockers();
    if !critical_blockers.is_empty() {
        return Err(format!(
            "windows shell capability blockers: {}",
            critical_blockers.join("; ")
        ));
    }

    let policy_input = PolicyInput {
        user_id: Some(auth_session.workos_user_id.clone()),
        entitlement_state: entitlement_state.clone(),
        trial_seconds_used: std::env::var("SKILLY_WINDOWS_TRIAL_SECONDS_USED")
            .ok()
            .and_then(|raw_value| raw_value.parse::<u64>().ok())
            .unwrap_or(0),
        usage_seconds_used: std::env::var("SKILLY_WINDOWS_USAGE_SECONDS_USED")
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
            turn_id: "windows-turn-1".to_string(),
        },
        RealtimeEvent::AudioCaptureCommitted {
            turn_id: "windows-turn-1".to_string(),
        },
        RealtimeEvent::AudioPlaybackStarted {
            turn_id: "windows-turn-1".to_string(),
        },
        RealtimeEvent::ResponseCompleted {
            turn_id: "windows-turn-1".to_string(),
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

pub mod stub {
    //! Env-var-driven adapter implementations used by the CI smoke binary and
    //! by the GUI host crate when running outside Windows production builds.

    use super::{
        AdapterCapabilityStatus, AudioAdapter, CaptureAdapter, HotkeyAdapter, OverlayAdapter,
        PermissionAdapter, PlatformAdapters, PlatformCapabilitySnapshot,
    };

    pub fn map_windows_capture_mode(capture_mode: &str) -> AdapterCapabilityStatus {
        if capture_mode == "disabled" {
            return AdapterCapabilityStatus::Unavailable {
                reason: "SKILLY_WINDOWS_CAPTURE_MODE=disabled".to_string(),
            };
        }
        if capture_mode == "dxgi-fallback" {
            return AdapterCapabilityStatus::Degraded {
                reason: "capture running with fallback mode".to_string(),
            };
        }
        AdapterCapabilityStatus::Available
    }

    pub fn map_windows_hotkey_mode(hotkey_mode: &str) -> AdapterCapabilityStatus {
        if hotkey_mode == "disabled" {
            return AdapterCapabilityStatus::Unavailable {
                reason: "SKILLY_WINDOWS_HOTKEY_MODE=disabled".to_string(),
            };
        }
        if hotkey_mode == "app-only" {
            return AdapterCapabilityStatus::Degraded {
                reason: "hotkey works only while shell window is focused".to_string(),
            };
        }
        AdapterCapabilityStatus::Available
    }

    pub fn map_windows_overlay_mode(overlay_mode: &str) -> AdapterCapabilityStatus {
        if overlay_mode == "disabled" {
            return AdapterCapabilityStatus::Unavailable {
                reason: "SKILLY_WINDOWS_OVERLAY_MODE=disabled".to_string(),
            };
        }
        if overlay_mode == "limited" {
            return AdapterCapabilityStatus::Degraded {
                reason: "overlay cannot draw across multiple monitors".to_string(),
            };
        }
        AdapterCapabilityStatus::Available
    }

    pub fn map_windows_audio_input_mode(audio_input_mode: &str) -> AdapterCapabilityStatus {
        if audio_input_mode == "disabled" {
            return AdapterCapabilityStatus::Unavailable {
                reason: "SKILLY_WINDOWS_AUDIO_INPUT=disabled".to_string(),
            };
        }
        AdapterCapabilityStatus::Available
    }

    pub fn map_windows_audio_output_mode(audio_output_mode: &str) -> AdapterCapabilityStatus {
        if audio_output_mode == "disabled" {
            return AdapterCapabilityStatus::Unavailable {
                reason: "SKILLY_WINDOWS_AUDIO_OUTPUT=disabled".to_string(),
            };
        }
        AdapterCapabilityStatus::Available
    }

    pub fn map_windows_permission_state(permission_state: &str) -> AdapterCapabilityStatus {
        if permission_state == "blocked" {
            return AdapterCapabilityStatus::Unavailable {
                reason: "SKILLY_WINDOWS_PERMISSION_STATE=blocked".to_string(),
            };
        }
        AdapterCapabilityStatus::Available
    }

    #[derive(Debug, Default)]
    pub struct StubCaptureAdapter;

    impl CaptureAdapter for StubCaptureAdapter {
        fn capability(&self) -> AdapterCapabilityStatus {
            let capture_mode = std::env::var("SKILLY_WINDOWS_CAPTURE_MODE")
                .unwrap_or_else(|_| "graphics-capture".to_string())
                .to_lowercase();
            map_windows_capture_mode(&capture_mode)
        }
    }

    #[derive(Debug, Default)]
    pub struct StubHotkeyAdapter;

    impl HotkeyAdapter for StubHotkeyAdapter {
        fn capability(&self) -> AdapterCapabilityStatus {
            let hotkey_mode = std::env::var("SKILLY_WINDOWS_HOTKEY_MODE")
                .unwrap_or_else(|_| "global-hook".to_string())
                .to_lowercase();
            map_windows_hotkey_mode(&hotkey_mode)
        }
    }

    #[derive(Debug, Default)]
    pub struct StubOverlayAdapter;

    impl OverlayAdapter for StubOverlayAdapter {
        fn capability(&self) -> AdapterCapabilityStatus {
            let overlay_mode = std::env::var("SKILLY_WINDOWS_OVERLAY_MODE")
                .unwrap_or_else(|_| "layered-window".to_string())
                .to_lowercase();
            map_windows_overlay_mode(&overlay_mode)
        }
    }

    #[derive(Debug, Default)]
    pub struct StubAudioAdapter;

    impl AudioAdapter for StubAudioAdapter {
        fn input_capability(&self) -> AdapterCapabilityStatus {
            let audio_input_mode = std::env::var("SKILLY_WINDOWS_AUDIO_INPUT")
                .unwrap_or_else(|_| "wasapi".to_string())
                .to_lowercase();
            map_windows_audio_input_mode(&audio_input_mode)
        }

        fn output_capability(&self) -> AdapterCapabilityStatus {
            let audio_output_mode = std::env::var("SKILLY_WINDOWS_AUDIO_OUTPUT")
                .unwrap_or_else(|_| "wasapi".to_string())
                .to_lowercase();
            map_windows_audio_output_mode(&audio_output_mode)
        }
    }

    #[derive(Debug, Default)]
    pub struct StubPermissionAdapter;

    impl PermissionAdapter for StubPermissionAdapter {
        fn capability(&self) -> AdapterCapabilityStatus {
            let permission_state = std::env::var("SKILLY_WINDOWS_PERMISSION_STATE")
                .unwrap_or_else(|_| "granted".to_string())
                .to_lowercase();
            map_windows_permission_state(&permission_state)
        }
    }

    #[derive(Debug, Default)]
    pub struct StubPlatformAdapters {
        pub capture: StubCaptureAdapter,
        pub hotkey: StubHotkeyAdapter,
        pub overlay: StubOverlayAdapter,
        pub audio: StubAudioAdapter,
        pub permissions: StubPermissionAdapter,
    }

    impl StubPlatformAdapters {
        pub fn new() -> Self {
            Self::default()
        }
    }

    impl PlatformAdapters for StubPlatformAdapters {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use stub::{map_windows_capture_mode, StubPlatformAdapters};

    #[test]
    fn windows_capture_mode_maps_degraded_and_unavailable() {
        assert!(matches!(
            map_windows_capture_mode("dxgi-fallback"),
            AdapterCapabilityStatus::Degraded { .. }
        ));
        assert!(matches!(
            map_windows_capture_mode("disabled"),
            AdapterCapabilityStatus::Unavailable { .. }
        ));
        assert!(matches!(
            map_windows_capture_mode("graphics-capture"),
            AdapterCapabilityStatus::Available
        ));
    }

    #[test]
    fn windows_entitlement_parser_handles_known_values() {
        assert!(matches!(
            entitlement_state_from_raw("trial"),
            EntitlementState::Trial
        ));
        assert!(matches!(
            entitlement_state_from_raw("canceled-valid"),
            EntitlementState::Canceled {
                access_still_valid: true
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

    #[test]
    fn stub_platform_adapters_yield_available_snapshot_under_defaults() {
        let adapters = StubPlatformAdapters::new();
        let snapshot = adapters.capability_snapshot();
        assert!(snapshot.critical_blockers().is_empty());
    }
}
