use serde::Serialize;
use skilly_windows_shell::PlatformCapabilitySnapshot;

use crate::platform::{
    build_platform_readiness, PlatformReadiness, ReadinessStatus, WindowsRuntimeFacts,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppState {
    pub meta: AppMeta,
    pub account: AccountState,
    pub readiness: PlatformReadiness,
    pub onboarding: OnboardingState,
    pub skills: SkillsState,
    pub live_turn: LiveTurnState,
    pub history: ConversationHistoryState,
    pub settings: SettingsState,
    pub notices: Vec<NoticeBanner>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppMeta {
    pub app_name: String,
    pub platform_label: String,
    pub shell_status: ReadinessStatus,
    pub updated_at_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountStatus {
    SignedOut,
    SigningIn,
    SignedIn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AccountState {
    pub status: AccountStatus,
    pub display_name: String,
    pub email: Option<String>,
    pub plan_label: String,
    pub usage_label: String,
    pub primary_action_label: String,
    pub primary_action_command: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingStatus {
    Ready,
    ActionRequired,
    InProgress,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OnboardingStep {
    pub id: String,
    pub title: String,
    pub detail: String,
    pub status: ReadinessStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OnboardingState {
    pub status: OnboardingStatus,
    pub headline: String,
    pub detail: String,
    pub primary_action_label: String,
    pub primary_action_command: String,
    pub steps: Vec<OnboardingStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillStatus {
    Active,
    Ready,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillItem {
    pub id: String,
    pub name: String,
    pub status: SkillStatus,
    pub summary: String,
    pub source_label: String,
    pub action_label: String,
    pub action_command: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillsState {
    pub headline: String,
    pub install_path_label: String,
    pub empty_detail: String,
    pub items: Vec<SkillItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveTurnPhase {
    Idle,
    Listening,
    Transcribing,
    Responding,
    Speaking,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LiveTurnState {
    pub phase: LiveTurnPhase,
    pub headline: String,
    pub detail: String,
    pub shortcut_label: String,
    pub transcript_preview: String,
    pub response_preview: String,
    pub capture_duration_ms: Option<u64>,
    pub capture_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ConversationHistoryItem {
    pub id: String,
    pub started_at_label: String,
    pub skill_name: String,
    pub user_text: String,
    pub assistant_text: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ConversationHistoryState {
    pub headline: String,
    pub empty_detail: String,
    pub items: Vec<ConversationHistoryItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PushToTalkSettings {
    pub shortcut_label: String,
    pub hold_to_talk: bool,
    pub customizable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AccessibilitySettings {
    pub reduced_motion: bool,
    pub reduced_motion_source: String,
    pub supports_high_contrast: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioSettings {
    pub input_device_label: String,
    pub output_device_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SettingsState {
    pub push_to_talk: PushToTalkSettings,
    pub accessibility: AccessibilitySettings,
    pub audio: AudioSettings,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NoticeBanner {
    pub tone: ReadinessStatus,
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppRuntimeSnapshot {
    pub build_number: Option<u32>,
    pub webview2_runtime: Option<bool>,
    pub account_display_name: Option<String>,
    pub account_email: Option<String>,
    pub plan_label: Option<String>,
    pub usage_label: Option<String>,
    pub active_skill_name: Option<String>,
    pub installed_skill_count: usize,
    pub reduced_motion: bool,
    pub live_turn_phase: LiveTurnPhase,
    pub transcript_preview: Option<String>,
    pub response_preview: Option<String>,
    pub capture_duration_ms: Option<u64>,
    pub capture_bytes: Option<u64>,
    pub history_items: Vec<ConversationHistoryItem>,
}

impl Default for AppRuntimeSnapshot {
    fn default() -> Self {
        Self {
            build_number: Some(22_621),
            webview2_runtime: Some(true),
            account_display_name: None,
            account_email: None,
            plan_label: None,
            usage_label: None,
            active_skill_name: None,
            installed_skill_count: 0,
            reduced_motion: false,
            live_turn_phase: LiveTurnPhase::Idle,
            transcript_preview: None,
            response_preview: None,
            capture_duration_ms: None,
            capture_bytes: None,
            history_items: Vec::new(),
        }
    }
}

impl AppState {
    pub fn preview() -> Self {
        let capability_snapshot = PlatformCapabilitySnapshot {
            capture: skilly_windows_shell::AdapterCapabilityStatus::Available,
            hotkey: skilly_windows_shell::AdapterCapabilityStatus::Degraded {
                reason: "Global hotkey is still using the focused-window fallback.".to_string(),
            },
            overlay: skilly_windows_shell::AdapterCapabilityStatus::Available,
            audio_input: skilly_windows_shell::AdapterCapabilityStatus::Available,
            audio_output: skilly_windows_shell::AdapterCapabilityStatus::Available,
            permissions: skilly_windows_shell::AdapterCapabilityStatus::Degraded {
                reason: "Accessibility guidance still needs to be completed.".to_string(),
            },
        };

        Self::from_runtime_snapshot(
            &capability_snapshot,
            &AppRuntimeSnapshot {
                account_display_name: Some("Skilly Builder".to_string()),
                account_email: Some("windows@tryskilly.app".to_string()),
                plan_label: Some("Founder preview".to_string()),
                usage_label: Some("15 free minutes remaining".to_string()),
                active_skill_name: Some("Blender Basics".to_string()),
                installed_skill_count: 3,
                transcript_preview: Some("How do I bevel this cube?".to_string()),
                response_preview: Some(
                    "Open the modifier tab, then pick Bevel in the stack.".to_string(),
                ),
                history_items: vec![ConversationHistoryItem {
                    id: "preview-turn".to_string(),
                    started_at_label: "Just now".to_string(),
                    skill_name: "Blender Basics".to_string(),
                    user_text: "How do I bevel this cube?".to_string(),
                    assistant_text: "Open the modifier tab, then pick Bevel in the stack."
                        .to_string(),
                    duration_ms: 2_800,
                }],
                ..AppRuntimeSnapshot::default()
            },
        )
    }

    pub fn from_runtime_snapshot(
        capability_snapshot: &PlatformCapabilitySnapshot,
        runtime: &AppRuntimeSnapshot,
    ) -> Self {
        let readiness = build_platform_readiness(
            capability_snapshot,
            &WindowsRuntimeFacts {
                build_number: runtime.build_number,
                webview2_runtime: runtime.webview2_runtime,
            },
        );

        let signed_in = runtime.account_email.is_some();
        let readiness_is_ready = readiness.overall_status == ReadinessStatus::Ready;
        let readiness_action = if readiness_is_ready {
            ("Open panel", "focus_panel")
        } else {
            ("Finish setup", "open_readiness")
        };

        let active_skill_name = runtime
            .active_skill_name
            .clone()
            .unwrap_or_else(|| "No active skill".to_string());

        let skills_items = if runtime.installed_skill_count == 0 {
            Vec::new()
        } else {
            vec![SkillItem {
                id: active_skill_name.to_lowercase().replace(' ', "-"),
                name: active_skill_name.clone(),
                status: if runtime.active_skill_name.is_some() {
                    SkillStatus::Active
                } else {
                    SkillStatus::Ready
                },
                summary: "Ready for voice-first guided teaching.".to_string(),
                source_label: "%APPDATA%\\Skilly\\skills".to_string(),
                action_label: if runtime.active_skill_name.is_some() {
                    "Deactivate".to_string()
                } else {
                    "Activate".to_string()
                },
                action_command: if runtime.active_skill_name.is_some() {
                    "deactivate_skill".to_string()
                } else {
                    "activate_skill".to_string()
                },
            }]
        };

        let notices = if readiness.blockers.is_empty() {
            Vec::new()
        } else {
            vec![NoticeBanner {
                tone: ReadinessStatus::Blocked,
                title: "Setup still required".to_string(),
                detail: readiness.blockers.join(" · "),
            }]
        };
        let readiness_summary = readiness.summary.clone();
        let onboarding_steps = readiness
            .checks
            .iter()
            .take(4)
            .map(|check| OnboardingStep {
                id: check.id.clone(),
                title: check.title.clone(),
                detail: check.detail.clone(),
                status: check.status,
            })
            .collect::<Vec<_>>();

        Self {
            meta: AppMeta {
                app_name: "Skilly".to_string(),
                platform_label: "Windows host".to_string(),
                shell_status: readiness.overall_status,
                updated_at_label: "Live".to_string(),
            },
            readiness,
            account: AccountState {
                status: if signed_in {
                    AccountStatus::SignedIn
                } else {
                    AccountStatus::SignedOut
                },
                display_name: runtime
                    .account_display_name
                    .clone()
                    .unwrap_or_else(|| "Guest".to_string()),
                email: runtime.account_email.clone(),
                plan_label: runtime
                    .plan_label
                    .clone()
                    .unwrap_or_else(|| "Sign in to unlock sync".to_string()),
                usage_label: runtime
                    .usage_label
                    .clone()
                    .unwrap_or_else(|| "No synced usage yet".to_string()),
                primary_action_label: if signed_in {
                    "Manage account".to_string()
                } else {
                    "Sign in".to_string()
                },
                primary_action_command: if signed_in {
                    "open_account_settings".to_string()
                } else {
                    "open_sign_in".to_string()
                },
            },
            onboarding: OnboardingState {
                status: if readiness_is_ready && signed_in {
                    OnboardingStatus::Ready
                } else if signed_in {
                    OnboardingStatus::ActionRequired
                } else {
                    OnboardingStatus::InProgress
                },
                headline: if readiness_is_ready && signed_in {
                    "You can teach with Skilly now.".to_string()
                } else {
                    "Finish the Windows setup loop.".to_string()
                },
                detail: readiness_summary,
                primary_action_label: readiness_action.0.to_string(),
                primary_action_command: readiness_action.1.to_string(),
                steps: onboarding_steps,
            },
            skills: SkillsState {
                headline: "Skills".to_string(),
                install_path_label: "%APPDATA%\\Skilly\\skills".to_string(),
                empty_detail:
                    "Drop a skill folder here or use the installer to seed bundled skills."
                        .to_string(),
                items: skills_items,
            },
            live_turn: LiveTurnState {
                phase: runtime.live_turn_phase.clone(),
                headline: match runtime.live_turn_phase {
                    LiveTurnPhase::Idle => "Waiting for Ctrl + Alt".to_string(),
                    LiveTurnPhase::Listening => "Listening".to_string(),
                    LiveTurnPhase::Transcribing => "Transcribing".to_string(),
                    LiveTurnPhase::Responding => "Planning the next teaching step".to_string(),
                    LiveTurnPhase::Speaking => "Speaking".to_string(),
                    LiveTurnPhase::Error => "Turn error".to_string(),
                },
                detail: if readiness_is_ready {
                    "Hold the shortcut, speak naturally, and release to commit the turn."
                        .to_string()
                } else {
                    "Skilly will switch to the full teaching loop once setup blockers are cleared."
                        .to_string()
                },
                shortcut_label: "Ctrl + Alt".to_string(),
                transcript_preview: runtime
                    .transcript_preview
                    .clone()
                    .unwrap_or_else(|| "Your transcript will appear here.".to_string()),
                response_preview: runtime.response_preview.clone().unwrap_or_else(|| {
                    "Skilly's next teaching response will appear here.".to_string()
                }),
                capture_duration_ms: runtime.capture_duration_ms,
                capture_bytes: runtime.capture_bytes,
            },
            history: ConversationHistoryState {
                headline: "Recent turns".to_string(),
                empty_detail: "Committed turns will stay here so the user can recover context."
                    .to_string(),
                items: runtime.history_items.clone(),
            },
            settings: SettingsState {
                push_to_talk: PushToTalkSettings {
                    shortcut_label: "Ctrl + Alt".to_string(),
                    hold_to_talk: true,
                    customizable: true,
                },
                accessibility: AccessibilitySettings {
                    reduced_motion: runtime.reduced_motion,
                    reduced_motion_source: if runtime.reduced_motion {
                        "system".to_string()
                    } else {
                        "app".to_string()
                    },
                    supports_high_contrast: true,
                },
                audio: AudioSettings {
                    input_device_label: "Default microphone".to_string(),
                    output_device_label: "Default speakers".to_string(),
                },
            },
            notices,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppRuntimeSnapshot, AppState, LiveTurnPhase};
    use crate::platform::ReadinessStatus;
    use skilly_windows_shell::{AdapterCapabilityStatus, PlatformCapabilitySnapshot};

    fn ready_snapshot() -> PlatformCapabilitySnapshot {
        PlatformCapabilitySnapshot {
            capture: AdapterCapabilityStatus::Available,
            hotkey: AdapterCapabilityStatus::Available,
            overlay: AdapterCapabilityStatus::Available,
            audio_input: AdapterCapabilityStatus::Available,
            audio_output: AdapterCapabilityStatus::Available,
            permissions: AdapterCapabilityStatus::Available,
        }
    }

    #[test]
    fn preview_state_is_serializable_and_populated() {
        let preview = AppState::preview();
        let json = serde_json::to_value(&preview).expect("preview should serialize");

        assert_eq!(json["meta"]["app_name"], "Skilly");
        assert_eq!(json["history"]["items"][0]["skill_name"], "Blender Basics");
        assert_eq!(json["live_turn"]["phase"], "idle");
    }

    #[test]
    fn signed_out_runtime_uses_sign_in_actions() {
        let state =
            AppState::from_runtime_snapshot(&ready_snapshot(), &AppRuntimeSnapshot::default());

        assert_eq!(state.account.primary_action_command, "open_sign_in");
        assert_eq!(state.account.email, None);
        assert_eq!(state.onboarding.primary_action_command, "focus_panel");
    }

    #[test]
    fn blocked_readiness_creates_notice_banner() {
        let snapshot = PlatformCapabilitySnapshot {
            capture: AdapterCapabilityStatus::Unavailable {
                reason: "capture disabled".to_string(),
            },
            hotkey: AdapterCapabilityStatus::Available,
            overlay: AdapterCapabilityStatus::Available,
            audio_input: AdapterCapabilityStatus::Available,
            audio_output: AdapterCapabilityStatus::Available,
            permissions: AdapterCapabilityStatus::Available,
        };

        let state = AppState::from_runtime_snapshot(&snapshot, &AppRuntimeSnapshot::default());

        assert_eq!(state.readiness.overall_status, ReadinessStatus::Blocked);
        assert_eq!(state.notices.len(), 1);
        assert!(state.notices[0].detail.contains("Screen capture"));
    }

    #[test]
    fn live_turn_runtime_passes_capture_details_through() {
        let state = AppState::from_runtime_snapshot(
            &ready_snapshot(),
            &AppRuntimeSnapshot {
                live_turn_phase: LiveTurnPhase::Listening,
                transcript_preview: Some("Explain this menu.".to_string()),
                response_preview: Some("Looking at the toolbar now.".to_string()),
                capture_duration_ms: Some(1_250),
                capture_bytes: Some(48_000),
                ..AppRuntimeSnapshot::default()
            },
        );

        assert_eq!(state.live_turn.phase, LiveTurnPhase::Listening);
        assert_eq!(state.live_turn.capture_duration_ms, Some(1_250));
        assert_eq!(state.live_turn.capture_bytes, Some(48_000));
    }
}
