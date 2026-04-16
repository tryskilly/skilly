//! Linux shell bootstrap smoke runner.
//!
//! This is a bootstrap binary for Phase 4 migration validation. It intentionally
//! uses mocked host adapters while proving shared core policy + realtime flow.

use skilly_core_domain::{EntitlementState, PolicyConfig, PolicyInput};
use skilly_core_policy::can_start_turn;
use skilly_core_realtime::{replay_events, RealtimeEvent};

#[derive(Debug, Clone)]
struct AuthSession {
    workos_user_id: String,
    session_token: String,
}

#[derive(Debug)]
struct ShellSmokeResult {
    auth_user_id: String,
    allowed_to_start_turn: bool,
    final_phase: String,
    turns_completed: u64,
}

fn acquire_auth_session() -> AuthSession {
    AuthSession {
        workos_user_id: "linux-smoke-user".to_string(),
        session_token: "session-token-bootstrap".to_string(),
    }
}

fn run_smoke_flow() -> Result<ShellSmokeResult, String> {
    let auth_session = acquire_auth_session();
    if auth_session.session_token.is_empty() {
        return Err("auth session token is missing".to_string());
    }

    let policy_config = PolicyConfig::default();
    let policy_input = PolicyInput {
        user_id: Some(auth_session.workos_user_id.clone()),
        entitlement_state: EntitlementState::Active,
        trial_seconds_used: 0,
        usage_seconds_used: 0,
    };
    let policy_decision = can_start_turn(&policy_config, &policy_input);
    if !policy_decision.allowed {
        return Err("policy blocked turn start in smoke flow".to_string());
    }

    let events = vec![
        RealtimeEvent::TurnStarted {
            turn_id: "linux-smoke-turn-1".to_string(),
        },
        RealtimeEvent::AudioCaptureCommitted {
            turn_id: "linux-smoke-turn-1".to_string(),
        },
        RealtimeEvent::ResponseStarted {
            turn_id: "linux-smoke-turn-1".to_string(),
        },
        RealtimeEvent::ResponseCompleted {
            turn_id: "linux-smoke-turn-1".to_string(),
        },
    ];

    let final_state = replay_events(&events)
        .map_err(|replay_error| format!("replay failed: {replay_error:?}"))?;

    Ok(ShellSmokeResult {
        auth_user_id: auth_session.workos_user_id,
        allowed_to_start_turn: policy_decision.allowed,
        final_phase: final_state.phase_name().to_string(),
        turns_completed: final_state.turns_completed,
    })
}

fn main() {
    let smoke_requested = std::env::args().any(|arg| arg == "--smoke");
    if !smoke_requested {
        println!("skilly-linux-shell bootstrap ready (use --smoke)");
        return;
    }

    match run_smoke_flow() {
        Ok(smoke_result) => {
            println!(
                "linux shell smoke passed: user={} allowed={} phase={} turns_completed={}",
                smoke_result.auth_user_id,
                smoke_result.allowed_to_start_turn,
                smoke_result.final_phase,
                smoke_result.turns_completed
            );
        }
        Err(error_message) => {
            eprintln!("linux shell smoke failed: {error_message}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::run_smoke_flow;

    #[test]
    fn smoke_flow_completes_turn() {
        let smoke_result = run_smoke_flow().expect("smoke flow should succeed");
        assert!(smoke_result.allowed_to_start_turn);
        assert_eq!(smoke_result.final_phase, "completed");
        assert_eq!(smoke_result.turns_completed, 1);
    }
}
