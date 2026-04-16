//! Shared domain contracts for Skilly's Rust core.

/// Entitlement states used by the shared policy engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntitlementState {
    None,
    Trial,
    Active,
    Canceled { access_still_valid: bool },
    Expired,
}

/// Input to policy checks. Mirrors current Swift-side runtime state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyInput {
    pub user_id: Option<String>,
    pub entitlement_state: EntitlementState,
    pub trial_seconds_used: u64,
    pub usage_seconds_used: u64,
}

/// Result returned by policy checks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub reason: Option<BlockReason>,
    pub is_admin_user: bool,
}

/// Canonical block reasons mapped from current entitlement logic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockReason {
    TrialExhausted,
    CapReached,
    SubscriptionInactive,
    Expired,
}

/// Configuration for deterministic policy evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyConfig {
    pub admin_workos_user_ids: Vec<String>,
    pub trial_max_seconds: u64,
    pub usage_max_seconds: u64,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            admin_workos_user_ids: Vec::new(),
            trial_max_seconds: 900,
            usage_max_seconds: 10_800,
        }
    }
}

