//! Entitlement and usage policy evaluation for shared runtime behavior.

use skilly_core_domain::{
    BlockReason, EntitlementState, PolicyConfig, PolicyDecision, PolicyInput,
};

/// Returns true when the current user is configured as admin.
pub fn is_admin_user(policy_config: &PolicyConfig, user_id: Option<&str>) -> bool {
    let Some(user_id) = user_id else {
        return false;
    };

    policy_config
        .admin_workos_user_ids
        .iter()
        .any(|admin_user_id| admin_user_id == user_id)
}

/// Returns whether trial is exhausted using current policy rules.
pub fn trial_is_exhausted(policy_config: &PolicyConfig, policy_input: &PolicyInput) -> bool {
    if is_admin_user(policy_config, policy_input.user_id.as_deref()) {
        return false;
    }

    policy_input.trial_seconds_used >= policy_config.trial_max_seconds
}

/// Returns whether usage is over cap using current policy rules.
pub fn usage_is_over_cap(policy_config: &PolicyConfig, policy_input: &PolicyInput) -> bool {
    if is_admin_user(policy_config, policy_input.user_id.as_deref()) {
        return false;
    }

    policy_input.usage_seconds_used >= policy_config.usage_max_seconds
}

/// Canonical can-start-turn evaluation aligned with current Swift behavior.
pub fn can_start_turn(policy_config: &PolicyConfig, policy_input: &PolicyInput) -> PolicyDecision {
    let admin_user = is_admin_user(policy_config, policy_input.user_id.as_deref());
    if admin_user {
        return PolicyDecision {
            allowed: true,
            reason: None,
            is_admin_user: true,
        };
    }

    match policy_input.entitlement_state {
        EntitlementState::None | EntitlementState::Trial => {
            if trial_is_exhausted(policy_config, policy_input) {
                PolicyDecision {
                    allowed: false,
                    reason: Some(BlockReason::TrialExhausted),
                    is_admin_user: false,
                }
            } else {
                PolicyDecision {
                    allowed: true,
                    reason: None,
                    is_admin_user: false,
                }
            }
        }
        EntitlementState::Active => {
            if usage_is_over_cap(policy_config, policy_input) {
                PolicyDecision {
                    allowed: false,
                    reason: Some(BlockReason::CapReached),
                    is_admin_user: false,
                }
            } else {
                PolicyDecision {
                    allowed: true,
                    reason: None,
                    is_admin_user: false,
                }
            }
        }
        EntitlementState::Canceled {
            access_still_valid,
        } => {
            if !access_still_valid {
                PolicyDecision {
                    allowed: false,
                    reason: Some(BlockReason::Expired),
                    is_admin_user: false,
                }
            } else if usage_is_over_cap(policy_config, policy_input) {
                PolicyDecision {
                    allowed: false,
                    reason: Some(BlockReason::CapReached),
                    is_admin_user: false,
                }
            } else {
                PolicyDecision {
                    allowed: true,
                    reason: None,
                    is_admin_user: false,
                }
            }
        }
        EntitlementState::Expired => PolicyDecision {
            allowed: false,
            reason: Some(BlockReason::Expired),
            is_admin_user: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use skilly_core_domain::{EntitlementState, PolicyConfig, PolicyInput};

    use crate::can_start_turn;

    fn default_policy_input(entitlement_state: EntitlementState) -> PolicyInput {
        PolicyInput {
            user_id: Some("user_non_admin".to_string()),
            entitlement_state,
            trial_seconds_used: 0,
            usage_seconds_used: 0,
        }
    }

    #[test]
    fn admin_user_is_allowed_regardless_of_caps() {
        let policy_config = PolicyConfig {
            admin_workos_user_ids: vec!["user_admin".to_string()],
            trial_max_seconds: 900,
            usage_max_seconds: 10_800,
        };
        let policy_input = PolicyInput {
            user_id: Some("user_admin".to_string()),
            entitlement_state: EntitlementState::Expired,
            trial_seconds_used: 9_999,
            usage_seconds_used: 99_999,
        };

        let decision = can_start_turn(&policy_config, &policy_input);
        assert!(decision.allowed);
        assert!(decision.reason.is_none());
        assert!(decision.is_admin_user);
    }

    #[test]
    fn trial_user_is_blocked_when_trial_exhausted() {
        let policy_config = PolicyConfig::default();
        let mut policy_input = default_policy_input(EntitlementState::Trial);
        policy_input.trial_seconds_used = 900;

        let decision = can_start_turn(&policy_config, &policy_input);
        assert!(!decision.allowed);
    }

    #[test]
    fn active_user_is_blocked_when_usage_over_cap() {
        let policy_config = PolicyConfig::default();
        let mut policy_input = default_policy_input(EntitlementState::Active);
        policy_input.usage_seconds_used = 10_800;

        let decision = can_start_turn(&policy_config, &policy_input);
        assert!(!decision.allowed);
    }

    #[test]
    fn canceled_user_with_valid_access_obeys_cap() {
        let policy_config = PolicyConfig::default();
        let mut policy_input = default_policy_input(EntitlementState::Canceled {
            access_still_valid: true,
        });
        policy_input.usage_seconds_used = 10_700;

        let allowed_decision = can_start_turn(&policy_config, &policy_input);
        assert!(allowed_decision.allowed);

        policy_input.usage_seconds_used = 10_800;
        let blocked_decision = can_start_turn(&policy_config, &policy_input);
        assert!(!blocked_decision.allowed);
    }
}

