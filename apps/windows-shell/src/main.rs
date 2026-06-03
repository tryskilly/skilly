//! CI smoke binary for the Windows shell adapter contract.
//!
//! All adapter trait definitions, stub implementations, and the turn-flow
//! harness live in `skilly_windows_shell` (this crate's library target). This
//! binary is a thin CLI wrapper that exercises the env-var-driven stubs end
//! to end so the workspace CI can detect contract regressions without needing
//! a real Windows host.

use skilly_windows_shell::{
    load_auth_session_from_env, resolve_entitlement_state_from_env, run_turn_flow,
    stub::StubPlatformAdapters,
};

fn main() {
    let smoke_requested = std::env::args().any(|argument| argument == "--smoke");
    if !smoke_requested {
        println!("skilly-windows-shell adapters ready (use --smoke)");
        return;
    }

    let auth_session = match load_auth_session_from_env() {
        Ok(session) => session,
        Err(error_message) => {
            eprintln!("windows shell flow failed: {error_message}");
            std::process::exit(1);
        }
    };

    let entitlement_state = resolve_entitlement_state_from_env();
    let adapters = StubPlatformAdapters::new();

    match run_turn_flow(&adapters, auth_session, entitlement_state) {
        Ok(flow_result) => {
            println!(
                "windows shell flow passed: user={} entitlement={:?} allowed={} phase={} turns_completed={} capture={:?} hotkey={:?} overlay={:?} audio_in={:?} audio_out={:?} permissions={:?}",
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
            eprintln!("windows shell flow failed: {error_message}");
            std::process::exit(1);
        }
    }
}
