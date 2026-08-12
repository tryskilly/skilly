use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fmt::{Display, Formatter};
use std::sync::atomic::{AtomicU64, Ordering};

const DEFAULT_HISTORY_LIMIT: usize = 50;
const DEFAULT_SKILL_NAME: &str = "General guidance";
const PREVIEW_CHAR_LIMIT: usize = 280;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnPhase {
    Idle,
    Listening,
    Transcribing,
    Responding,
    Speaking,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConversationTurn {
    pub id: String,
    pub generation: u64,
    pub started_at_ms: u64,
    pub completed_at_ms: u64,
    pub duration_ms: u64,
    pub skill_name: String,
    pub user_text: String,
    pub assistant_text: String,
    pub assistant_audio_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnRuntimeSnapshot {
    pub generation: Option<u64>,
    pub phase: TurnPhase,
    pub skill_name: Option<String>,
    pub transcript_preview: String,
    pub response_preview: String,
    pub capture_duration_ms: Option<u64>,
    pub capture_bytes: Option<usize>,
    pub assistant_audio_bytes: usize,
    pub error_message: Option<String>,
    pub history: Vec<ConversationTurn>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveTurn {
    generation: u64,
    started_at_ms: u64,
    skill_name: Option<String>,
    transcript: String,
    response: String,
    capture_duration_ms: Option<u64>,
    capture_bytes: Option<usize>,
    assistant_audio_bytes: usize,
    phase: TurnPhase,
    error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnRuntimeEvent {
    CaptureCommitted {
        generation: u64,
        capture_duration_ms: Option<u64>,
        capture_bytes: Option<usize>,
    },
    UserTranscript {
        generation: u64,
        transcript: String,
    },
    AssistantTextDelta {
        generation: u64,
        delta: String,
    },
    AssistantAudioDelta {
        generation: u64,
        bytes: usize,
    },
    AssistantCompleted {
        generation: u64,
        completed_at_ms: u64,
    },
    Failed {
        generation: u64,
        message: String,
    },
}

impl TurnRuntimeEvent {
    fn generation(&self) -> u64 {
        match self {
            TurnRuntimeEvent::CaptureCommitted { generation, .. }
            | TurnRuntimeEvent::UserTranscript { generation, .. }
            | TurnRuntimeEvent::AssistantTextDelta { generation, .. }
            | TurnRuntimeEvent::AssistantAudioDelta { generation, .. }
            | TurnRuntimeEvent::AssistantCompleted { generation, .. }
            | TurnRuntimeEvent::Failed { generation, .. } => *generation,
        }
    }

    fn label(&self) -> &'static str {
        match self {
            TurnRuntimeEvent::CaptureCommitted { .. } => "capture_committed",
            TurnRuntimeEvent::UserTranscript { .. } => "user_transcript",
            TurnRuntimeEvent::AssistantTextDelta { .. } => "assistant_text_delta",
            TurnRuntimeEvent::AssistantAudioDelta { .. } => "assistant_audio_delta",
            TurnRuntimeEvent::AssistantCompleted { .. } => "assistant_completed",
            TurnRuntimeEvent::Failed { .. } => "failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnRuntimeError {
    StaleEvent {
        event_generation: u64,
        active_generation: u64,
    },
    NoActiveTurn {
        event_generation: u64,
        latest_generation: u64,
    },
    InvalidTransition {
        phase: TurnPhase,
        event: &'static str,
    },
    EmptyTranscript,
    EmptyAssistantDelta,
    EmptyErrorMessage,
}

impl Display for TurnRuntimeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TurnRuntimeError::StaleEvent {
                event_generation,
                active_generation,
            } => write!(
                formatter,
                "stale event generation {event_generation}; active generation is {active_generation}"
            ),
            TurnRuntimeError::NoActiveTurn {
                event_generation,
                latest_generation,
            } => write!(
                formatter,
                "no active turn for generation {event_generation}; latest generation is {latest_generation}"
            ),
            TurnRuntimeError::InvalidTransition { phase, event } => {
                write!(formatter, "cannot apply {event} while phase is {phase:?}")
            }
            TurnRuntimeError::EmptyTranscript => {
                formatter.write_str("user transcript must not be empty")
            }
            TurnRuntimeError::EmptyAssistantDelta => {
                formatter.write_str("assistant text delta must not be empty")
            }
            TurnRuntimeError::EmptyErrorMessage => {
                formatter.write_str("turn error message must not be empty")
            }
        }
    }
}

impl std::error::Error for TurnRuntimeError {}

#[derive(Debug)]
pub struct TurnRuntime {
    generation_clock: AtomicU64,
    active: Option<ActiveTurn>,
    history: VecDeque<ConversationTurn>,
    history_limit: usize,
}

impl Default for TurnRuntime {
    fn default() -> Self {
        Self::new(DEFAULT_HISTORY_LIMIT)
    }
}

impl TurnRuntime {
    pub fn new(history_limit: usize) -> Self {
        Self {
            generation_clock: AtomicU64::new(0),
            active: None,
            history: VecDeque::new(),
            history_limit: history_limit.max(1),
        }
    }

    pub fn begin_listening(&mut self, started_at_ms: u64, skill_name: Option<String>) -> u64 {
        let generation = self.generation_clock.fetch_add(1, Ordering::SeqCst) + 1;
        self.active = Some(ActiveTurn {
            generation,
            started_at_ms,
            skill_name: normalize_optional_text(skill_name),
            transcript: String::new(),
            response: String::new(),
            capture_duration_ms: None,
            capture_bytes: None,
            assistant_audio_bytes: 0,
            phase: TurnPhase::Listening,
            error_message: None,
        });
        generation
    }

    pub fn cancel_active_turn(&mut self) -> Option<u64> {
        let cancelled_generation = self.active.as_ref().map(|turn| turn.generation)?;
        self.generation_clock.fetch_add(1, Ordering::SeqCst);
        self.active = None;
        Some(cancelled_generation)
    }

    pub fn active_generation(&self) -> Option<u64> {
        self.active.as_ref().map(|turn| turn.generation)
    }

    pub fn restore_history(&mut self, history: Vec<ConversationTurn>) {
        self.history.clear();
        for turn in history
            .into_iter()
            .rev()
            .take(self.history_limit)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
        {
            self.generation_clock
                .fetch_max(turn.generation, Ordering::SeqCst);
            self.history.push_back(turn);
        }
    }

    pub fn apply_event(
        &mut self,
        event: TurnRuntimeEvent,
    ) -> Result<TurnRuntimeSnapshot, TurnRuntimeError> {
        self.ensure_generation_matches(event.generation())?;

        match event {
            TurnRuntimeEvent::CaptureCommitted {
                generation: _,
                capture_duration_ms,
                capture_bytes,
            } => {
                let active = self.active_mut()?;
                match active.phase {
                    TurnPhase::Listening | TurnPhase::Transcribing => {
                        active.phase = TurnPhase::Transcribing;
                        merge_capture_metrics(active, capture_duration_ms, capture_bytes);
                    }
                    _ => {
                        return Err(TurnRuntimeError::InvalidTransition {
                            phase: active.phase,
                            event: "capture_committed",
                        });
                    }
                }
            }
            TurnRuntimeEvent::UserTranscript {
                generation: _,
                transcript,
            } => {
                let transcript =
                    trim_required_text(transcript).ok_or(TurnRuntimeError::EmptyTranscript)?;
                let active = self.active_mut()?;
                match active.phase {
                    TurnPhase::Listening | TurnPhase::Transcribing | TurnPhase::Responding => {
                        active.transcript = transcript;
                        active.phase = TurnPhase::Responding;
                    }
                    TurnPhase::Speaking => {
                        active.transcript = transcript;
                    }
                    _ => {
                        return Err(TurnRuntimeError::InvalidTransition {
                            phase: active.phase,
                            event: "user_transcript",
                        });
                    }
                }
            }
            TurnRuntimeEvent::AssistantTextDelta {
                generation: _,
                delta,
            } => {
                let delta =
                    trim_preserving_spacing(delta).ok_or(TurnRuntimeError::EmptyAssistantDelta)?;
                let active = self.active_mut()?;
                match active.phase {
                    TurnPhase::Transcribing | TurnPhase::Responding | TurnPhase::Speaking => {
                        active.response.push_str(&delta);
                        if active.phase != TurnPhase::Speaking {
                            active.phase = TurnPhase::Responding;
                        }
                    }
                    _ => {
                        return Err(TurnRuntimeError::InvalidTransition {
                            phase: active.phase,
                            event: "assistant_text_delta",
                        });
                    }
                }
            }
            TurnRuntimeEvent::AssistantAudioDelta {
                generation: _,
                bytes,
            } => {
                let active = self.active_mut()?;
                match active.phase {
                    TurnPhase::Transcribing | TurnPhase::Responding | TurnPhase::Speaking => {
                        active.assistant_audio_bytes =
                            active.assistant_audio_bytes.saturating_add(bytes);
                        active.phase = TurnPhase::Speaking;
                    }
                    _ => {
                        return Err(TurnRuntimeError::InvalidTransition {
                            phase: active.phase,
                            event: "assistant_audio_delta",
                        });
                    }
                }
            }
            TurnRuntimeEvent::AssistantCompleted {
                generation: _,
                completed_at_ms,
            } => {
                let active = self.active.take().expect("active turn checked above");
                match active.phase {
                    TurnPhase::Transcribing | TurnPhase::Responding | TurnPhase::Speaking => {
                        self.push_history(active.into_history_turn(completed_at_ms));
                    }
                    _ => {
                        self.active = Some(active);
                        return Err(TurnRuntimeError::InvalidTransition {
                            phase: self
                                .active
                                .as_ref()
                                .map(|turn| turn.phase)
                                .unwrap_or(TurnPhase::Idle),
                            event: "assistant_completed",
                        });
                    }
                }
            }
            TurnRuntimeEvent::Failed {
                generation: _,
                message,
            } => {
                let message =
                    trim_required_text(message).ok_or(TurnRuntimeError::EmptyErrorMessage)?;
                let active = self.active_mut()?;
                active.phase = TurnPhase::Error;
                active.error_message = Some(message);
            }
        }

        Ok(self.snapshot())
    }

    pub fn snapshot(&self) -> TurnRuntimeSnapshot {
        if let Some(active) = &self.active {
            return TurnRuntimeSnapshot {
                generation: Some(active.generation),
                phase: active.phase,
                skill_name: active.skill_name.clone(),
                transcript_preview: preview_text(&active.transcript),
                response_preview: preview_text(&active.response),
                capture_duration_ms: active.capture_duration_ms,
                capture_bytes: active.capture_bytes,
                assistant_audio_bytes: active.assistant_audio_bytes,
                error_message: active.error_message.clone(),
                history: self.history.iter().cloned().collect(),
            };
        }

        TurnRuntimeSnapshot {
            generation: None,
            phase: TurnPhase::Idle,
            skill_name: None,
            transcript_preview: String::new(),
            response_preview: String::new(),
            capture_duration_ms: None,
            capture_bytes: None,
            assistant_audio_bytes: 0,
            error_message: None,
            history: self.history.iter().cloned().collect(),
        }
    }

    fn ensure_generation_matches(&self, generation: u64) -> Result<(), TurnRuntimeError> {
        if let Some(active) = &self.active {
            if generation == active.generation {
                return Ok(());
            }

            return Err(TurnRuntimeError::StaleEvent {
                event_generation: generation,
                active_generation: active.generation,
            });
        }

        Err(TurnRuntimeError::NoActiveTurn {
            event_generation: generation,
            latest_generation: self.generation_clock.load(Ordering::SeqCst),
        })
    }

    fn active_mut(&mut self) -> Result<&mut ActiveTurn, TurnRuntimeError> {
        self.active.as_mut().ok_or(TurnRuntimeError::NoActiveTurn {
            event_generation: 0,
            latest_generation: self.generation_clock.load(Ordering::SeqCst),
        })
    }

    fn push_history(&mut self, turn: ConversationTurn) {
        self.history.push_back(turn);
        while self.history.len() > self.history_limit {
            self.history.pop_front();
        }
    }
}

impl ActiveTurn {
    fn into_history_turn(self, completed_at_ms: u64) -> ConversationTurn {
        ConversationTurn {
            id: format!("turn-{}", self.generation),
            generation: self.generation,
            started_at_ms: self.started_at_ms,
            completed_at_ms,
            duration_ms: completed_at_ms.saturating_sub(self.started_at_ms),
            skill_name: self
                .skill_name
                .unwrap_or_else(|| DEFAULT_SKILL_NAME.to_string()),
            user_text: self.transcript.trim().to_string(),
            assistant_text: self.response.trim().to_string(),
            assistant_audio_bytes: self.assistant_audio_bytes,
        }
    }
}

fn merge_capture_metrics(
    active: &mut ActiveTurn,
    capture_duration_ms: Option<u64>,
    capture_bytes: Option<usize>,
) {
    if let Some(capture_duration_ms) = capture_duration_ms {
        active.capture_duration_ms = Some(capture_duration_ms);
    }
    if let Some(capture_bytes) = capture_bytes {
        active.capture_bytes = Some(capture_bytes);
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(trim_required_text)
}

fn trim_required_text(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn trim_preserving_spacing(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn preview_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= PREVIEW_CHAR_LIMIT {
        return trimmed.to_string();
    }

    let mut preview = trimmed.chars().take(PREVIEW_CHAR_LIMIT).collect::<String>();
    preview.push('…');
    preview
}

#[cfg(test)]
mod tests {
    use super::{TurnPhase, TurnRuntime, TurnRuntimeError, TurnRuntimeEvent};

    #[test]
    fn start_listening_assigns_monotonic_generation() {
        let mut runtime = TurnRuntime::default();

        let first = runtime.begin_listening(100, Some("Blender".to_string()));
        let second = runtime.begin_listening(200, Some("Figma".to_string()));

        assert_eq!(first, 1);
        assert_eq!(second, 2);
        assert_eq!(runtime.snapshot().generation, Some(2));
        assert_eq!(runtime.snapshot().phase, TurnPhase::Listening);
    }

    #[test]
    fn stale_events_are_rejected_after_new_generation_starts() {
        let mut runtime = TurnRuntime::default();
        let first = runtime.begin_listening(100, Some("Blender".to_string()));
        let _second = runtime.begin_listening(200, Some("Figma".to_string()));

        let error = runtime
            .apply_event(TurnRuntimeEvent::CaptureCommitted {
                generation: first,
                capture_duration_ms: Some(900),
                capture_bytes: Some(32_000),
            })
            .expect_err("stale event should be rejected");

        assert_eq!(
            error,
            TurnRuntimeError::StaleEvent {
                event_generation: 1,
                active_generation: 2,
            }
        );
    }

    #[test]
    fn full_turn_flow_records_history_and_returns_to_idle() {
        let mut runtime = TurnRuntime::new(10);
        let generation = runtime.begin_listening(1_000, Some("Blender Basics".to_string()));

        runtime
            .apply_event(TurnRuntimeEvent::CaptureCommitted {
                generation,
                capture_duration_ms: Some(1_250),
                capture_bytes: Some(48_000),
            })
            .expect("capture should commit");
        runtime
            .apply_event(TurnRuntimeEvent::UserTranscript {
                generation,
                transcript: "How do I add a bevel?".to_string(),
            })
            .expect("transcript should apply");
        runtime
            .apply_event(TurnRuntimeEvent::AssistantTextDelta {
                generation,
                delta: "Open the modifier tab.".to_string(),
            })
            .expect("assistant text should apply");
        runtime
            .apply_event(TurnRuntimeEvent::AssistantAudioDelta {
                generation,
                bytes: 16_000,
            })
            .expect("assistant audio should apply");
        let snapshot = runtime
            .apply_event(TurnRuntimeEvent::AssistantCompleted {
                generation,
                completed_at_ms: 4_500,
            })
            .expect("completion should succeed");

        assert_eq!(snapshot.phase, TurnPhase::Idle);
        assert_eq!(snapshot.history.len(), 1);
        assert_eq!(snapshot.history[0].duration_ms, 3_500);
        assert_eq!(snapshot.history[0].skill_name, "Blender Basics");
        assert_eq!(snapshot.history[0].user_text, "How do I add a bevel?");
        assert_eq!(snapshot.history[0].assistant_audio_bytes, 16_000);
    }

    #[test]
    fn history_is_bounded() {
        let mut runtime = TurnRuntime::new(2);

        for generation_index in 0..3 {
            let generation = runtime.begin_listening(
                generation_index * 1_000,
                Some(format!("Skill {generation_index}")),
            );
            runtime
                .apply_event(TurnRuntimeEvent::CaptureCommitted {
                    generation,
                    capture_duration_ms: Some(100),
                    capture_bytes: Some(2_000),
                })
                .expect("capture should commit");
            runtime
                .apply_event(TurnRuntimeEvent::UserTranscript {
                    generation,
                    transcript: format!("Question {generation_index}"),
                })
                .expect("transcript should apply");
            runtime
                .apply_event(TurnRuntimeEvent::AssistantTextDelta {
                    generation,
                    delta: format!("Answer {generation_index}"),
                })
                .expect("response should apply");
            runtime
                .apply_event(TurnRuntimeEvent::AssistantCompleted {
                    generation,
                    completed_at_ms: generation_index * 1_000 + 400,
                })
                .expect("completion should apply");
        }

        let snapshot = runtime.snapshot();
        assert_eq!(snapshot.history.len(), 2);
        assert_eq!(snapshot.history[0].generation, 2);
        assert_eq!(snapshot.history[1].generation, 3);
    }

    #[test]
    fn failed_turn_preserves_context_until_replaced() {
        let mut runtime = TurnRuntime::default();
        let generation = runtime.begin_listening(500, Some("Excel".to_string()));

        runtime
            .apply_event(TurnRuntimeEvent::CaptureCommitted {
                generation,
                capture_duration_ms: None,
                capture_bytes: None,
            })
            .expect("capture should commit");
        let snapshot = runtime
            .apply_event(TurnRuntimeEvent::Failed {
                generation,
                message: "session expired".to_string(),
            })
            .expect("failure should apply");

        assert_eq!(snapshot.phase, TurnPhase::Error);
        assert_eq!(snapshot.error_message.as_deref(), Some("session expired"));
        assert_eq!(snapshot.history.len(), 0);
    }
}
