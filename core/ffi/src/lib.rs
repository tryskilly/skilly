//! FFI boundary crate.
//!
//! This crate exposes a stable bridge layer for native platform shells
//! (Swift on macOS, WinUI/.NET on Windows, GTK on Linux).

use std::ffi::CStr;
use std::os::raw::c_char;

use skilly_core_domain::{
    BlockReason, EntitlementState, PolicyConfig, PolicyDecision, PolicyInput,
};
use skilly_core_policy::{can_start_turn, trial_is_exhausted, usage_is_over_cap};

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
    let allowed_bit = if policy_decision.allowed { 1_u64 } else { 0_u64 };
    let admin_bit = if policy_decision.is_admin_user {
        1_u64 << 1
    } else {
        0_u64
    };
    let reason_bits = (map_block_reason(policy_decision.reason) as u64) << 8;

    allowed_bit | admin_bit | reason_bits
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
