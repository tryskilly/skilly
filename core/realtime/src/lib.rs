//! Shared realtime orchestration state machine for deterministic turn/session behavior.

use serde::{Deserialize, Serialize};

/// Canonical session phases used by the shared orchestration layer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RealtimeSessionPhase {
    Idle,
    Capturing { turn_id: String },
    AwaitingResponse { turn_id: String },
    Speaking { turn_id: String },
    Completed { turn_id: String },
    Failed { turn_id: String, message: String },
}

/// Full mutable state for the realtime session lifecycle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RealtimeSessionState {
    pub phase: RealtimeSessionPhase,
    pub turns_completed: u64,
    pub last_turn_id: Option<String>,
}

impl Default for RealtimeSessionState {
    fn default() -> Self {
        Self {
            phase: RealtimeSessionPhase::Idle,
            turns_completed: 0,
            last_turn_id: None,
        }
    }
}

/// Realtime lifecycle events consumed by the state machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RealtimeEvent {
    TurnStarted { turn_id: String },
    AudioCaptureCommitted { turn_id: String },
    ResponseStarted { turn_id: String },
    AudioPlaybackStarted { turn_id: String },
    ResponseCompleted { turn_id: String },
    SessionError { turn_id: String, message: String },
    SessionReset,
}

/// Transition error returned for invalid event ordering or turn mismatches.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeTransitionError {
    pub event: RealtimeEvent,
    pub phase: RealtimeSessionPhase,
    pub reason: String,
}

/// Replay error that includes the event index where processing failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeReplayError {
    pub event_index: usize,
    pub transition_error: RealtimeTransitionError,
}

impl RealtimeSessionState {
    /// Applies a single event transition to the current session state.
    pub fn apply_event(&mut self, event: RealtimeEvent) -> Result<(), RealtimeTransitionError> {
        match &event {
            RealtimeEvent::SessionReset => {
                self.phase = RealtimeSessionPhase::Idle;
                self.last_turn_id = None;
                return Ok(());
            }
            RealtimeEvent::TurnStarted { turn_id } => {
                self.phase = RealtimeSessionPhase::Capturing {
                    turn_id: turn_id.clone(),
                };
                self.last_turn_id = Some(turn_id.clone());
                return Ok(());
            }
            RealtimeEvent::SessionError { turn_id, message } => {
                if self.turn_id_matches(turn_id) {
                    self.phase = RealtimeSessionPhase::Failed {
                        turn_id: turn_id.clone(),
                        message: message.clone(),
                    };
                    self.last_turn_id = Some(turn_id.clone());
                    return Ok(());
                }
                return Err(self
                    .transition_error(event, "session_error turn_id does not match active turn"));
            }
            RealtimeEvent::AudioCaptureCommitted { turn_id } => {
                if !self.turn_id_matches(turn_id) {
                    return Err(
                        self.transition_error(event, "audio_capture_committed turn_id mismatch")
                    );
                }

                match self.phase {
                    RealtimeSessionPhase::Capturing { .. } => {
                        self.phase = RealtimeSessionPhase::AwaitingResponse {
                            turn_id: turn_id.clone(),
                        };
                        return Ok(());
                    }
                    _ => {
                        return Err(self.transition_error(
                            event,
                            "audio_capture_committed is only valid while capturing",
                        ))
                    }
                }
            }
            RealtimeEvent::ResponseStarted { turn_id }
            | RealtimeEvent::AudioPlaybackStarted { turn_id } => {
                if !self.turn_id_matches(turn_id) {
                    return Err(self.transition_error(event, "response_started turn_id mismatch"));
                }

                match self.phase {
                    RealtimeSessionPhase::AwaitingResponse { .. } => {
                        self.phase = RealtimeSessionPhase::Speaking {
                            turn_id: turn_id.clone(),
                        };
                        return Ok(());
                    }
                    _ => {
                        return Err(self.transition_error(
                            event,
                            "response_started is only valid while awaiting_response",
                        ))
                    }
                }
            }
            RealtimeEvent::ResponseCompleted { turn_id } => {
                if !self.turn_id_matches(turn_id) {
                    return Err(self.transition_error(event, "response_completed turn_id mismatch"));
                }

                match self.phase {
                    RealtimeSessionPhase::AwaitingResponse { .. }
                    | RealtimeSessionPhase::Speaking { .. } => {
                        self.phase = RealtimeSessionPhase::Completed {
                            turn_id: turn_id.clone(),
                        };
                        self.turns_completed += 1;
                        self.last_turn_id = Some(turn_id.clone());
                        return Ok(());
                    }
                    _ => {
                        return Err(self.transition_error(
                            event,
                            "response_completed is only valid after request commit",
                        ))
                    }
                }
            }
        }
    }

    fn turn_id_matches(&self, turn_id: &str) -> bool {
        match &self.phase {
            RealtimeSessionPhase::Idle => false,
            RealtimeSessionPhase::Capturing {
                turn_id: active_turn_id,
            }
            | RealtimeSessionPhase::AwaitingResponse {
                turn_id: active_turn_id,
            }
            | RealtimeSessionPhase::Speaking {
                turn_id: active_turn_id,
            }
            | RealtimeSessionPhase::Completed {
                turn_id: active_turn_id,
            }
            | RealtimeSessionPhase::Failed {
                turn_id: active_turn_id,
                ..
            } => active_turn_id == turn_id,
        }
    }

    fn transition_error(&self, event: RealtimeEvent, reason: &str) -> RealtimeTransitionError {
        RealtimeTransitionError {
            event,
            phase: self.phase.clone(),
            reason: reason.to_string(),
        }
    }

    pub fn phase_name(&self) -> &'static str {
        match self.phase {
            RealtimeSessionPhase::Idle => "idle",
            RealtimeSessionPhase::Capturing { .. } => "capturing",
            RealtimeSessionPhase::AwaitingResponse { .. } => "awaiting_response",
            RealtimeSessionPhase::Speaking { .. } => "speaking",
            RealtimeSessionPhase::Completed { .. } => "completed",
            RealtimeSessionPhase::Failed { .. } => "failed",
        }
    }
}

/// Replays a full event stream and returns the final session state.
pub fn replay_events(
    events: &[RealtimeEvent],
) -> Result<RealtimeSessionState, RealtimeReplayError> {
    let mut state = RealtimeSessionState::default();

    for (event_index, event) in events.iter().cloned().enumerate() {
        if let Err(transition_error) = state.apply_event(event) {
            return Err(RealtimeReplayError {
                event_index,
                transition_error,
            });
        }
    }

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::fs;
    use std::path::Path;

    #[derive(Debug, Deserialize)]
    struct ReplayFixtureTrace {
        name: String,
        events: Vec<RealtimeEvent>,
        expected_final_phase: String,
        expected_turns_completed: u64,
    }

    #[derive(Debug, Deserialize)]
    struct ReplayFixtureFile {
        traces: Vec<ReplayFixtureTrace>,
    }

    #[test]
    fn replay_happy_path_completes_turn() {
        let events = vec![
            RealtimeEvent::TurnStarted {
                turn_id: "turn-1".to_string(),
            },
            RealtimeEvent::AudioCaptureCommitted {
                turn_id: "turn-1".to_string(),
            },
            RealtimeEvent::ResponseStarted {
                turn_id: "turn-1".to_string(),
            },
            RealtimeEvent::ResponseCompleted {
                turn_id: "turn-1".to_string(),
            },
        ];

        let final_state = replay_events(&events).expect("replay should succeed");
        assert_eq!(final_state.phase_name(), "completed");
        assert_eq!(final_state.turns_completed, 1);
    }

    #[test]
    fn replay_invalid_order_fails() {
        let events = vec![
            RealtimeEvent::TurnStarted {
                turn_id: "turn-1".to_string(),
            },
            RealtimeEvent::ResponseCompleted {
                turn_id: "turn-1".to_string(),
            },
        ];

        let replay_error = replay_events(&events).expect_err("replay should fail");
        assert_eq!(replay_error.event_index, 1);
        assert!(replay_error
            .transition_error
            .reason
            .contains("only valid after request commit"));
    }

    #[test]
    fn replay_fixtures_match_expected_state() {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("replay_traces.json");
        let fixture_json = fs::read_to_string(fixture_path).expect("fixture should exist");
        let fixture_file: ReplayFixtureFile =
            serde_json::from_str(&fixture_json).expect("fixture should parse");

        for trace in fixture_file.traces {
            let final_state = replay_events(&trace.events)
                .unwrap_or_else(|_| panic!("trace '{}' should replay cleanly", trace.name));
            assert_eq!(
                final_state.phase_name(),
                trace.expected_final_phase,
                "trace '{}' ended in unexpected phase",
                trace.name
            );
            assert_eq!(
                final_state.turns_completed, trace.expected_turns_completed,
                "trace '{}' completed turn count mismatch",
                trace.name
            );
        }
    }
}
