//! UniFFI-friendly mobile SDK surface for selected Skilly core APIs.

use skilly_core_domain::{BlockReason, EntitlementState, PolicyConfig, PolicyInput};
use skilly_core_policy::{can_start_turn, trial_is_exhausted, usage_is_over_cap};
use skilly_core_realtime::{replay_events, RealtimeEvent};

uniffi::setup_scaffolding!();

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MobileEntitlementState {
    None,
    Trial,
    Active,
    CanceledValid,
    CanceledExpired,
    Expired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MobileBlockReason {
    TrialExhausted,
    CapReached,
    SubscriptionInactive,
    Expired,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MobilePolicyInput {
    pub user_id: Option<String>,
    pub entitlement_state: MobileEntitlementState,
    pub trial_seconds_used: u64,
    pub usage_seconds_used: u64,
    pub admin_workos_user_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MobilePolicyDecision {
    pub allowed: bool,
    pub reason: Option<MobileBlockReason>,
    pub is_admin_user: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MobileRealtimeEventType {
    TurnStarted,
    AudioCaptureCommitted,
    ResponseStarted,
    AudioPlaybackStarted,
    ResponseCompleted,
    SessionError,
    SessionReset,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MobileRealtimeEvent {
    pub event_type: MobileRealtimeEventType,
    pub turn_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MobileRealtimeReplaySummary {
    pub phase_name: String,
    pub turns_completed: u64,
}

#[uniffi::export]
pub fn can_start_turn_for_mobile(input: MobilePolicyInput) -> MobilePolicyDecision {
    let policy_config = PolicyConfig {
        admin_workos_user_ids: input.admin_workos_user_ids,
        ..PolicyConfig::default()
    };
    let policy_input = PolicyInput {
        user_id: input.user_id,
        entitlement_state: map_mobile_entitlement_state(input.entitlement_state),
        trial_seconds_used: input.trial_seconds_used,
        usage_seconds_used: input.usage_seconds_used,
    };

    let decision = can_start_turn(&policy_config, &policy_input);
    MobilePolicyDecision {
        allowed: decision.allowed,
        reason: map_mobile_block_reason(decision.reason),
        is_admin_user: decision.is_admin_user,
    }
}

#[uniffi::export]
pub fn trial_is_exhausted_for_mobile(input: MobilePolicyInput) -> bool {
    let policy_config = PolicyConfig {
        admin_workos_user_ids: input.admin_workos_user_ids,
        ..PolicyConfig::default()
    };
    let policy_input = PolicyInput {
        user_id: input.user_id,
        entitlement_state: EntitlementState::Trial,
        trial_seconds_used: input.trial_seconds_used,
        usage_seconds_used: 0,
    };

    trial_is_exhausted(&policy_config, &policy_input)
}

#[uniffi::export]
pub fn usage_is_over_cap_for_mobile(input: MobilePolicyInput) -> bool {
    let policy_config = PolicyConfig {
        admin_workos_user_ids: input.admin_workos_user_ids,
        ..PolicyConfig::default()
    };
    let policy_input = PolicyInput {
        user_id: input.user_id,
        entitlement_state: EntitlementState::Active,
        trial_seconds_used: 0,
        usage_seconds_used: input.usage_seconds_used,
    };

    usage_is_over_cap(&policy_config, &policy_input)
}

#[uniffi::export]
pub fn replay_realtime_events_for_mobile(
    events: Vec<MobileRealtimeEvent>,
) -> Option<MobileRealtimeReplaySummary> {
    let parsed_events: Vec<RealtimeEvent> = events
        .iter()
        .map(parse_mobile_realtime_event)
        .collect::<Option<Vec<_>>>()?;

    let final_state = replay_events(&parsed_events).ok()?;
    Some(MobileRealtimeReplaySummary {
        phase_name: final_state.phase_name().to_string(),
        turns_completed: final_state.turns_completed,
    })
}

#[uniffi::export]
pub fn replay_realtime_events_from_json_for_mobile(
    events_json: String,
) -> Option<MobileRealtimeReplaySummary> {
    let parsed_events: Vec<RealtimeEvent> = serde_json::from_str(&events_json).ok()?;
    let final_state = replay_events(&parsed_events).ok()?;

    Some(MobileRealtimeReplaySummary {
        phase_name: final_state.phase_name().to_string(),
        turns_completed: final_state.turns_completed,
    })
}

fn map_mobile_entitlement_state(entitlement_state: MobileEntitlementState) -> EntitlementState {
    match entitlement_state {
        MobileEntitlementState::None => EntitlementState::None,
        MobileEntitlementState::Trial => EntitlementState::Trial,
        MobileEntitlementState::Active => EntitlementState::Active,
        MobileEntitlementState::CanceledValid => EntitlementState::Canceled {
            access_still_valid: true,
        },
        MobileEntitlementState::CanceledExpired => EntitlementState::Canceled {
            access_still_valid: false,
        },
        MobileEntitlementState::Expired => EntitlementState::Expired,
    }
}

fn map_mobile_block_reason(block_reason: Option<BlockReason>) -> Option<MobileBlockReason> {
    match block_reason {
        Some(BlockReason::TrialExhausted) => Some(MobileBlockReason::TrialExhausted),
        Some(BlockReason::CapReached) => Some(MobileBlockReason::CapReached),
        Some(BlockReason::SubscriptionInactive) => Some(MobileBlockReason::SubscriptionInactive),
        Some(BlockReason::Expired) => Some(MobileBlockReason::Expired),
        None => None,
    }
}

fn parse_mobile_realtime_event(event: &MobileRealtimeEvent) -> Option<RealtimeEvent> {
    match event.event_type {
        MobileRealtimeEventType::TurnStarted => Some(RealtimeEvent::TurnStarted {
            turn_id: event.turn_id.clone()?,
        }),
        MobileRealtimeEventType::AudioCaptureCommitted => {
            Some(RealtimeEvent::AudioCaptureCommitted {
                turn_id: event.turn_id.clone()?,
            })
        }
        MobileRealtimeEventType::ResponseStarted => Some(RealtimeEvent::ResponseStarted {
            turn_id: event.turn_id.clone()?,
        }),
        MobileRealtimeEventType::AudioPlaybackStarted => {
            Some(RealtimeEvent::AudioPlaybackStarted {
                turn_id: event.turn_id.clone()?,
            })
        }
        MobileRealtimeEventType::ResponseCompleted => Some(RealtimeEvent::ResponseCompleted {
            turn_id: event.turn_id.clone()?,
        }),
        MobileRealtimeEventType::SessionError => Some(RealtimeEvent::SessionError {
            turn_id: event.turn_id.clone()?,
            message: event
                .message
                .clone()
                .unwrap_or_else(|| "session error".to_string()),
        }),
        MobileRealtimeEventType::SessionReset => Some(RealtimeEvent::SessionReset),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn can_start_turn_mobile_matches_policy_expectation() {
        let decision = can_start_turn_for_mobile(MobilePolicyInput {
            user_id: Some("user-1".to_string()),
            entitlement_state: MobileEntitlementState::Trial,
            trial_seconds_used: 901,
            usage_seconds_used: 0,
            admin_workos_user_ids: Vec::new(),
        });

        assert!(!decision.allowed);
        assert_eq!(decision.reason, Some(MobileBlockReason::TrialExhausted));
        assert!(!decision.is_admin_user);
    }

    #[test]
    fn replay_realtime_events_mobile_returns_summary_on_valid_sequence() {
        let events = vec![
            MobileRealtimeEvent {
                event_type: MobileRealtimeEventType::TurnStarted,
                turn_id: Some("turn-42".to_string()),
                message: None,
            },
            MobileRealtimeEvent {
                event_type: MobileRealtimeEventType::AudioCaptureCommitted,
                turn_id: Some("turn-42".to_string()),
                message: None,
            },
            MobileRealtimeEvent {
                event_type: MobileRealtimeEventType::ResponseStarted,
                turn_id: Some("turn-42".to_string()),
                message: None,
            },
            MobileRealtimeEvent {
                event_type: MobileRealtimeEventType::ResponseCompleted,
                turn_id: Some("turn-42".to_string()),
                message: None,
            },
        ];

        let summary = replay_realtime_events_for_mobile(events)
            .expect("summary should be produced for valid event sequence");
        assert_eq!(summary.phase_name, "completed");
        assert_eq!(summary.turns_completed, 1);
    }

    #[test]
    fn replay_realtime_events_mobile_returns_none_when_required_turn_id_missing() {
        let events = vec![MobileRealtimeEvent {
            event_type: MobileRealtimeEventType::TurnStarted,
            turn_id: None,
            message: None,
        }];

        assert!(replay_realtime_events_for_mobile(events).is_none());
    }
}
