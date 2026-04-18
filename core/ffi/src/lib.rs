//! FFI boundary crate.
//!
//! This crate exposes a stable bridge layer for native platform shells
//! (Swift on macOS, WinUI/.NET on Windows, GTK on Linux).

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use skilly_core_domain::{
    BlockReason, EntitlementState, PolicyConfig, PolicyDecision, PolicyInput,
};
use skilly_core_policy::{can_start_turn, trial_is_exhausted, usage_is_over_cap};
use skilly_core_realtime::{replay_events, RealtimeEvent};
use skilly_core_skills::{compose_prompt, SkillDefinition, SkillProgress};

/// Entitlement state values used by native shells.
/// Keep these in sync with `RustPolicyEntitlementState` in Swift.
pub const ENTITLEMENT_STATE_NONE: u8 = 0;
pub const ENTITLEMENT_STATE_TRIAL: u8 = 1;
pub const ENTITLEMENT_STATE_ACTIVE: u8 = 2;
pub const ENTITLEMENT_STATE_CANCELED_VALID: u8 = 3;
pub const ENTITLEMENT_STATE_CANCELED_EXPIRED: u8 = 4;
pub const ENTITLEMENT_STATE_EXPIRED: u8 = 5;

/// Block reason values returned to native shells.
pub const BLOCK_REASON_NONE: u8 = 255;
pub const BLOCK_REASON_TRIAL_EXHAUSTED: i32 = 0;
pub const BLOCK_REASON_CAP_REACHED: i32 = 1;
pub const BLOCK_REASON_SUBSCRIPTION_INACTIVE: i32 = 2;
pub const BLOCK_REASON_EXPIRED: i32 = 3;

fn parse_optional_string(raw: *const c_char) -> Option<String> {
    if raw.is_null() {
        return None;
    }

    let c_string = unsafe { CStr::from_ptr(raw) };
    let parsed_value = c_string.to_string_lossy().trim().to_string();
    if parsed_value.is_empty() {
        None
    } else {
        Some(parsed_value)
    }
}

fn parse_required_string(raw: *const c_char) -> Option<String> {
    if raw.is_null() {
        return None;
    }

    let c_string = unsafe { CStr::from_ptr(raw) };
    Some(c_string.to_string_lossy().to_string())
}

fn parse_csv_values(raw: *const c_char) -> Vec<String> {
    let Some(csv_string) = parse_optional_string(raw) else {
        return Vec::new();
    };

    csv_string
        .split(',')
        .map(|entry| entry.trim().to_string())
        .filter(|entry| !entry.is_empty())
        .collect()
}

fn map_entitlement_state(raw_state: u8) -> EntitlementState {
    match raw_state {
        ENTITLEMENT_STATE_TRIAL => EntitlementState::Trial,
        ENTITLEMENT_STATE_ACTIVE => EntitlementState::Active,
        ENTITLEMENT_STATE_CANCELED_VALID => EntitlementState::Canceled {
            access_still_valid: true,
        },
        ENTITLEMENT_STATE_CANCELED_EXPIRED => EntitlementState::Canceled {
            access_still_valid: false,
        },
        ENTITLEMENT_STATE_EXPIRED => EntitlementState::Expired,
        _ => EntitlementState::None,
    }
}

fn build_policy_config(admin_workos_user_ids_csv: *const c_char) -> PolicyConfig {
    PolicyConfig {
        admin_workos_user_ids: parse_csv_values(admin_workos_user_ids_csv),
        trial_max_seconds: 900,
        usage_max_seconds: 10_800,
    }
}

fn build_policy_input(
    user_id: *const c_char,
    entitlement_state: EntitlementState,
    trial_seconds_used: u64,
    usage_seconds_used: u64,
) -> PolicyInput {
    PolicyInput {
        user_id: parse_optional_string(user_id),
        entitlement_state,
        trial_seconds_used,
        usage_seconds_used,
    }
}

fn map_block_reason(block_reason: Option<BlockReason>) -> u8 {
    match block_reason {
        Some(BlockReason::TrialExhausted) => BLOCK_REASON_TRIAL_EXHAUSTED as u8,
        Some(BlockReason::CapReached) => BLOCK_REASON_CAP_REACHED as u8,
        Some(BlockReason::SubscriptionInactive) => BLOCK_REASON_SUBSCRIPTION_INACTIVE as u8,
        Some(BlockReason::Expired) => BLOCK_REASON_EXPIRED as u8,
        None => BLOCK_REASON_NONE,
    }
}

fn encode_policy_decision(policy_decision: PolicyDecision) -> u64 {
    let allowed_bit = if policy_decision.allowed {
        1_u64
    } else {
        0_u64
    };
    let admin_bit = if policy_decision.is_admin_user {
        1_u64 << 1
    } else {
        0_u64
    };
    let reason_bits = (map_block_reason(policy_decision.reason) as u64) << 8;

    allowed_bit | admin_bit | reason_bits
}

fn compose_prompt_from_json(
    base_prompt: &str,
    skill_definition_json: &str,
    skill_progress_json: &str,
) -> Option<String> {
    let skill_definition: SkillDefinition = serde_json::from_str(skill_definition_json).ok()?;
    let skill_progress: SkillProgress = serde_json::from_str(skill_progress_json).ok()?;

    Some(compose_prompt(
        base_prompt,
        &skill_definition,
        &skill_progress,
    ))
}

fn replay_realtime_events_summary_json(events_json: &str) -> Option<String> {
    let realtime_events: Vec<RealtimeEvent> = serde_json::from_str(events_json).ok()?;
    let final_state = replay_events(&realtime_events).ok()?;

    Some(
        serde_json::json!({
            "phase_name": final_state.phase_name(),
            "turns_completed": final_state.turns_completed,
        })
        .to_string(),
    )
}

#[no_mangle]
pub extern "C" fn skilly_policy_ffi_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn skilly_policy_can_start_turn(
    user_id: *const c_char,
    entitlement_state: u8,
    trial_seconds_used: u64,
    usage_seconds_used: u64,
    admin_workos_user_ids_csv: *const c_char,
) -> u64 {
    let policy_config = build_policy_config(admin_workos_user_ids_csv);
    let policy_input = build_policy_input(
        user_id,
        map_entitlement_state(entitlement_state),
        trial_seconds_used,
        usage_seconds_used,
    );

    let policy_decision = can_start_turn(&policy_config, &policy_input);
    encode_policy_decision(policy_decision)
}

#[no_mangle]
pub extern "C" fn skilly_policy_trial_is_exhausted(
    user_id: *const c_char,
    trial_seconds_used: u64,
    admin_workos_user_ids_csv: *const c_char,
) -> u8 {
    let policy_config = build_policy_config(admin_workos_user_ids_csv);
    let policy_input = build_policy_input(user_id, EntitlementState::Trial, trial_seconds_used, 0);

    u8::from(trial_is_exhausted(&policy_config, &policy_input))
}

#[no_mangle]
pub extern "C" fn skilly_policy_usage_is_over_cap(
    user_id: *const c_char,
    usage_seconds_used: u64,
    admin_workos_user_ids_csv: *const c_char,
) -> u8 {
    let policy_config = build_policy_config(admin_workos_user_ids_csv);
    let policy_input = build_policy_input(user_id, EntitlementState::Active, 0, usage_seconds_used);

    u8::from(usage_is_over_cap(&policy_config, &policy_input))
}

#[no_mangle]
pub extern "C" fn skilly_skills_compose_prompt_json(
    base_prompt: *const c_char,
    skill_definition_json: *const c_char,
    skill_progress_json: *const c_char,
) -> *mut c_char {
    let Some(base_prompt) = parse_required_string(base_prompt) else {
        return std::ptr::null_mut();
    };
    let Some(skill_definition_json) = parse_required_string(skill_definition_json) else {
        return std::ptr::null_mut();
    };
    let Some(skill_progress_json) = parse_required_string(skill_progress_json) else {
        return std::ptr::null_mut();
    };

    let Some(composed_prompt) =
        compose_prompt_from_json(&base_prompt, &skill_definition_json, &skill_progress_json)
    else {
        return std::ptr::null_mut();
    };

    match CString::new(composed_prompt) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn skilly_realtime_replay_events_json(events_json: *const c_char) -> *mut c_char {
    let Some(events_json) = parse_required_string(events_json) else {
        return std::ptr::null_mut();
    };

    let Some(summary_json) = replay_realtime_events_summary_json(&events_json) else {
        return std::ptr::null_mut();
    };

    match CString::new(summary_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn skilly_string_free(raw_string: *mut c_char) {
    if raw_string.is_null() {
        return;
    }

    unsafe {
        drop(CString::from_raw(raw_string));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::fs;
    use std::path::Path;

    #[test]
    fn compose_prompt_from_json_matches_skills_fixture() {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../skills/fixtures/compose_prompt_fixture.json");
        let fixture_json = fs::read_to_string(fixture_path).expect("fixture should exist");
        let fixture_value: Value =
            serde_json::from_str(&fixture_json).expect("fixture should parse");

        let base_prompt = fixture_value
            .get("base_prompt")
            .and_then(Value::as_str)
            .expect("base_prompt should be present");
        let skill_definition_json = fixture_value
            .get("skill")
            .expect("skill should be present")
            .to_string();
        let skill_progress_json = fixture_value
            .get("progress")
            .expect("progress should be present")
            .to_string();
        let expected_prompt = fixture_value
            .get("expected_prompt")
            .and_then(Value::as_str)
            .expect("expected_prompt should be present");

        let composed_prompt =
            compose_prompt_from_json(base_prompt, &skill_definition_json, &skill_progress_json)
                .expect("prompt composition should succeed");

        assert_eq!(composed_prompt, expected_prompt);
    }

    #[test]
    fn replay_realtime_events_summary_matches_fixture_trace() {
        let fixture_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../realtime/fixtures/replay_traces.json");
        let fixture_json = fs::read_to_string(fixture_path).expect("fixture should exist");
        let fixture_value: Value =
            serde_json::from_str(&fixture_json).expect("fixture should parse");

        let first_trace_events_json = fixture_value
            .get("traces")
            .and_then(Value::as_array)
            .and_then(|traces| traces.first())
            .and_then(|trace| trace.get("events"))
            .map(Value::to_string)
            .expect("trace events should be present");

        let summary_json = replay_realtime_events_summary_json(&first_trace_events_json)
            .expect("replay summary should succeed");
        let summary_value: Value =
            serde_json::from_str(&summary_json).expect("summary should parse");

        assert_eq!(
            summary_value.get("phase_name").and_then(Value::as_str),
            Some("completed")
        );
        assert_eq!(
            summary_value.get("turns_completed").and_then(Value::as_u64),
            Some(1)
        );
    }
}
