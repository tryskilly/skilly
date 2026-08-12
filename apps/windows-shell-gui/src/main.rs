//! Skilly Windows host app (Tauri 2) — Phase 7 entry point.
//!
//! This crate hosts the user-facing Windows GUI app. Adapter trait
//! definitions and stub implementations live in `skilly_windows_shell`
//! (`apps/windows-shell`); this crate consumes the same trait surface so the
//! host code path is identical between dev (env-var stubs) and production
//! (real Windows-specific adapter implementations, landing in subsequent
//! commits behind `#[cfg(target_os = "windows")]` modules).
//!
//! Scope and roadmap: docs/architecture/phase-7-windows-shell-prd.md

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use auth::OAuthEntropySource;
use backend_client::{
    BackendRequest, BackendResponse, BackendTransport, HttpMethod, TransportError,
};
use base64::Engine;
use credential_store::CredentialStore;
use serde::Serialize;
use skilly_windows_shell::{
    stub::StubPlatformAdapters, AdapterCapabilityStatus, PlatformAdapters,
    PlatformCapabilitySnapshot,
};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};

mod app_state;
mod auth;
mod backend_client;
mod credential_store;
mod overlay;
mod platform;
mod realtime_client;
mod realtime_protocol;
mod skills;
mod turn_runtime;

#[cfg(target_os = "windows")]
mod audio_format;
#[cfg(target_os = "windows")]
mod windows_audio;
#[cfg(target_os = "windows")]
mod windows_audio_output;
#[cfg(target_os = "windows")]
mod windows_overlay;
#[cfg(target_os = "windows")]
mod windows_screen_capture;

#[derive(Debug, Default)]
struct RuntimeStore {
    reduced_motion_override: Mutex<Option<bool>>,
    turn_runtime: Mutex<turn_runtime::TurnRuntime>,
    auth_session: Mutex<Option<auth::PersistedAuthSession>>,
    entitlement: Mutex<Option<backend_client::EntitlementResponse>>,
    auth_error: Mutex<Option<String>>,
    pending_oauth: Mutex<Option<auth::PendingOAuthState>>,
}

const AUTH_CREDENTIAL_TARGET: &str = "app.tryskilly.skilly.auth";
const AUTH_PENDING_TARGET: &str = "app.tryskilly.skilly.oauth.pending";
const SESSION_TTL_SECONDS: u64 = 60 * 60 * 24 * 30;

#[derive(Clone, Copy, Debug, Default)]
struct ReqwestTransport;

impl BackendTransport for ReqwestTransport {
    fn send(&self, request: BackendRequest) -> Result<BackendResponse, TransportError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|error| TransportError::new(format!("network client unavailable: {error}")))?;
        let method = match request.method {
            HttpMethod::Get => reqwest::Method::GET,
            HttpMethod::Post => reqwest::Method::POST,
        };
        let mut builder = client.request(method, &request.url);
        for (name, value) in request.headers {
            builder = builder.header(&name, &value);
        }
        if let Some(body) = request.body {
            builder = builder.body(body);
        }
        let response = builder
            .send()
            .map_err(|error| TransportError::new(format!("backend request failed: {error}")))?;
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.to_string(), value.to_owned()))
            })
            .collect();
        let body = response
            .bytes()
            .map_err(|error| TransportError::new(format!("backend response failed: {error}")))?
            .to_vec();
        Ok(BackendResponse {
            status,
            headers,
            body,
        })
    }
}

fn backend_client() -> Result<backend_client::BackendClient<ReqwestTransport>, String> {
    backend_client::BackendClient::with_default_base_url(ReqwestTransport)
        .map_err(|error| error.to_string())
}

fn load_saved_session() -> Option<auth::PersistedAuthSession> {
    credential_store::WindowsCredentialStore
        .load_json(AUTH_CREDENTIAL_TARGET)
        .ok()
        .flatten()
}

fn save_session(session: &auth::PersistedAuthSession) -> Result<(), String> {
    credential_store::WindowsCredentialStore
        .save_json(AUTH_CREDENTIAL_TARGET, Some(session.email.clone()), session)
        .map_err(|error| error.to_string())
}

fn fresh_oauth_state() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    auth::OsEntropy
        .fill_bytes(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|error| format!("failed to open browser: {error}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("failed to open browser: {error}"))?;
        Ok(())
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = url;
        Err("opening the browser is unsupported on this platform".to_owned())
    }
}

fn complete_auth_callback(runtime: &RuntimeStore, callback_url: &str) -> Result<(), String> {
    let callback = auth::parse_oauth_callback(callback_url).map_err(|error| error.to_string())?;
    let returned_state = callback
        .state
        .as_deref()
        .ok_or("sign-in callback omitted OAuth state")?;
    let pending = runtime
        .pending_oauth
        .lock()
        .map_err(|_| "sign-in state unavailable")?
        .take()
        .or_else(|| {
            credential_store::WindowsCredentialStore
                .load_json(AUTH_PENDING_TARGET)
                .ok()
                .flatten()
        })
        .ok_or("no sign-in attempt is pending")?;
    let _ = credential_store::WindowsCredentialStore.delete(AUTH_PENDING_TARGET);
    if pending.expires_at_ms < current_time_ms() || pending.state != returned_state {
        return Err("sign-in callback state is invalid or expired".to_owned());
    }
    let code = callback.auth_code().map_err(|error| error.to_string())?;
    let exchange = backend_client()?
        .exchange_auth_code(code)
        .map_err(|error| error.to_string())?;
    let session = auth::PersistedAuthSession {
        email: exchange.user.email,
        session_token: exchange.session_token,
        expires_at: current_time_ms() / 1000 + SESSION_TTL_SECONDS,
        refresh_token: exchange.refresh_token,
        user_id: Some(exchange.user.id),
    };
    save_session(&session)?;
    let entitlement = backend_client()?
        .fetch_entitlement(&session.session_token)
        .ok();
    *runtime
        .auth_session
        .lock()
        .map_err(|_| "auth state unavailable")? = Some(session);
    *runtime
        .entitlement
        .lock()
        .map_err(|_| "entitlement state unavailable")? = entitlement;
    *runtime
        .auth_error
        .lock()
        .map_err(|_| "auth state unavailable")? = None;
    Ok(())
}

#[derive(Clone, Debug, Default, Serialize)]
struct MicrophoneCaptureStatus {
    state: &'static str,
    bytes_captured: usize,
    duration_ms: u64,
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct CapabilityWireStatus {
    status: &'static str,
    reason: Option<String>,
}

impl From<&AdapterCapabilityStatus> for CapabilityWireStatus {
    fn from(adapter_capability_status: &AdapterCapabilityStatus) -> Self {
        match adapter_capability_status {
            AdapterCapabilityStatus::Available => CapabilityWireStatus {
                status: "available",
                reason: None,
            },
            AdapterCapabilityStatus::Degraded { reason } => CapabilityWireStatus {
                status: "degraded",
                reason: Some(reason.clone()),
            },
            AdapterCapabilityStatus::Unavailable { reason } => CapabilityWireStatus {
                status: "unavailable",
                reason: Some(reason.clone()),
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct CapabilitySnapshotPayload {
    capture: CapabilityWireStatus,
    hotkey: CapabilityWireStatus,
    overlay: CapabilityWireStatus,
    audio_input: CapabilityWireStatus,
    audio_output: CapabilityWireStatus,
    permissions: CapabilityWireStatus,
    critical_blockers: Vec<String>,
}

impl From<&PlatformCapabilitySnapshot> for CapabilitySnapshotPayload {
    fn from(platform_capability_snapshot: &PlatformCapabilitySnapshot) -> Self {
        CapabilitySnapshotPayload {
            capture: (&platform_capability_snapshot.capture).into(),
            hotkey: (&platform_capability_snapshot.hotkey).into(),
            overlay: (&platform_capability_snapshot.overlay).into(),
            audio_input: (&platform_capability_snapshot.audio_input).into(),
            audio_output: (&platform_capability_snapshot.audio_output).into(),
            permissions: (&platform_capability_snapshot.permissions).into(),
            critical_blockers: platform_capability_snapshot.critical_blockers(),
        }
    }
}

#[tauri::command]
fn capability_snapshot() -> CapabilitySnapshotPayload {
    let adapters = StubPlatformAdapters::new();
    let snapshot = adapters.capability_snapshot();
    (&snapshot).into()
}

#[derive(Debug, Serialize)]
struct PanelCommandResult {
    status: &'static str,
    message: String,
}

impl PanelCommandResult {
    fn ok(message: impl Into<String>) -> Self {
        Self {
            status: "ok",
            message: message.into(),
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReducedMotionPreferenceArgs {
    reduced_motion: bool,
}

impl RuntimeStore {
    fn reduced_motion(&self) -> bool {
        self.reduced_motion_override
            .lock()
            .map(|value| (*value).unwrap_or(false))
            .unwrap_or(false)
    }

    fn set_reduced_motion(&self, reduced_motion: bool) {
        if let Ok(mut value) = self.reduced_motion_override.lock() {
            *value = Some(reduced_motion);
        }
    }

    fn begin_turn(&self, skill_name: Option<String>) {
        if let Ok(mut runtime) = self.turn_runtime.lock() {
            runtime.begin_listening(current_time_ms(), skill_name);
        }
    }

    fn sync_capture_status(
        &self,
        capture: &MicrophoneCaptureStatus,
    ) -> turn_runtime::TurnRuntimeSnapshot {
        self.turn_runtime
            .lock()
            .map(|mut runtime| {
                if let Some(generation) = runtime.active_generation() {
                    match capture.state {
                        "committed" => {
                            let _ = runtime.apply_event(
                                turn_runtime::TurnRuntimeEvent::CaptureCommitted {
                                    generation,
                                    capture_duration_ms: Some(capture.duration_ms),
                                    capture_bytes: Some(capture.bytes_captured),
                                },
                            );
                        }
                        "error" => {
                            let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::Failed {
                                generation,
                                message: capture
                                    .error
                                    .clone()
                                    .unwrap_or_else(|| "Microphone capture failed".to_owned()),
                            });
                        }
                        _ => {}
                    }
                }
                runtime.snapshot()
            })
            .unwrap_or_else(|_| turn_runtime::TurnRuntimeSnapshot {
                generation: None,
                phase: turn_runtime::TurnPhase::Error,
                skill_name: None,
                transcript_preview: String::new(),
                response_preview: String::new(),
                capture_duration_ms: None,
                capture_bytes: None,
                assistant_audio_bytes: 0,
                error_message: Some("turn runtime unavailable".to_owned()),
                history: Vec::new(),
            })
    }

    fn commit_capture(&self, capture: &MicrophoneCaptureStatus) -> Option<u64> {
        if let Ok(mut runtime) = self.turn_runtime.lock() {
            if let Some(generation) = runtime.active_generation() {
                let duration_ms = (capture.duration_ms > 0).then_some(capture.duration_ms);
                let capture_bytes = (capture.bytes_captured > 0).then_some(capture.bytes_captured);
                let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::CaptureCommitted {
                    generation,
                    capture_duration_ms: duration_ms,
                    capture_bytes,
                });
                return Some(generation);
            }
        }
        None
    }

    fn authenticated_session(&self) -> Option<auth::PersistedAuthSession> {
        self.auth_session
            .lock()
            .ok()
            .and_then(|session| session.clone())
    }

    fn finish_teaching_turn(&self, generation: u64, result: &realtime_client::TeachingTurnResult) {
        if let Ok(mut runtime) = self.turn_runtime.lock() {
            let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::UserTranscript {
                generation,
                transcript: result.transcript.clone(),
            });
            if !result.response_text.is_empty() {
                let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::AssistantTextDelta {
                    generation,
                    delta: result.response_text.clone(),
                });
            }
            if !result.audio_pcm16.is_empty() {
                let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::AssistantAudioDelta {
                    generation,
                    bytes: result.audio_pcm16.len(),
                });
            }
            let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::AssistantCompleted {
                generation,
                completed_at_ms: current_time_ms(),
            });
        }
    }

    fn fail_teaching_turn(&self, generation: u64, message: String) {
        if let Ok(mut runtime) = self.turn_runtime.lock() {
            let _ = runtime.apply_event(turn_runtime::TurnRuntimeEvent::Failed {
                generation,
                message,
            });
        }
    }
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn skill_store() -> Result<skills::SkillStore, String> {
    let mut store =
        skills::SkillStore::for_windows_app_data().map_err(|error| error.to_string())?;
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            let bundled_root = parent.join("skills");
            if bundled_root.is_dir() {
                store = store.with_bundled_skills_root(bundled_root);
            }
        }
    }
    store
        .ensure_directories_exist()
        .map_err(|error| error.to_string())?;
    let _ = store.seed_bundled_skills();
    Ok(store)
}

fn map_skill_item(skill: skills::SkillListItem) -> app_state::SkillItem {
    let (status, action_label, action_command) = if skill.is_active {
        (
            app_state::SkillStatus::Active,
            "Deactivate".to_owned(),
            "deactivate_skill".to_owned(),
        )
    } else {
        (
            app_state::SkillStatus::Ready,
            "Activate".to_owned(),
            "activate_skill".to_owned(),
        )
    };

    let source_label = match skill.source_kind {
        skills::SkillSourceKind::Bundled => "Bundled with Skilly",
        skills::SkillSourceKind::Imported => "Imported by the user",
    };

    app_state::SkillItem {
        id: skill.id,
        name: skill.name,
        status,
        summary: format!("{} · {}", skill.target_app, skill.bundle_id),
        source_label: source_label.to_owned(),
        action_label,
        action_command,
    }
}

fn live_turn_phase_from_capture(capture: &MicrophoneCaptureStatus) -> app_state::LiveTurnPhase {
    match capture.state {
        "recording" => app_state::LiveTurnPhase::Listening,
        "committed" => app_state::LiveTurnPhase::Responding,
        "error" => app_state::LiveTurnPhase::Error,
        _ => app_state::LiveTurnPhase::Idle,
    }
}

fn map_turn_phase(phase: turn_runtime::TurnPhase) -> app_state::LiveTurnPhase {
    match phase {
        turn_runtime::TurnPhase::Idle => app_state::LiveTurnPhase::Idle,
        turn_runtime::TurnPhase::Listening => app_state::LiveTurnPhase::Listening,
        turn_runtime::TurnPhase::Transcribing => app_state::LiveTurnPhase::Transcribing,
        turn_runtime::TurnPhase::Responding => app_state::LiveTurnPhase::Responding,
        turn_runtime::TurnPhase::Speaking => app_state::LiveTurnPhase::Speaking,
        turn_runtime::TurnPhase::Error => app_state::LiveTurnPhase::Error,
    }
}

fn current_active_skill_name() -> Option<String> {
    skill_store().ok().and_then(|store| {
        store.list_skill_items().ok().and_then(|items| {
            items
                .into_iter()
                .find(|item| item.is_active)
                .map(|item| item.name)
        })
    })
}

#[cfg(target_os = "windows")]
fn process_committed_turn(app_handle: tauri::AppHandle, generation: u64) {
    std::thread::spawn(move || {
        let runtime = app_handle.state::<RuntimeStore>();
        let Some(session) = runtime.authenticated_session() else {
            runtime.fail_teaching_turn(
                generation,
                "Sign in before starting a teaching turn.".to_owned(),
            );
            return;
        };
        let Some(audio) = windows_audio::take_last_capture() else {
            runtime.fail_teaching_turn(generation, "No microphone audio was captured.".to_owned());
            return;
        };
        let token = match backend_client().and_then(|client| {
            client
                .fetch_openai_token(
                    &session.session_token,
                    Some(realtime_protocol::DEFAULT_REALTIME_MODEL),
                )
                .map_err(|error| error.to_string())
        }) {
            Ok(token) => token,
            Err(error) => {
                runtime.fail_teaching_turn(generation, error);
                return;
            }
        };
        let capture = windows_screen_capture::capture_primary_monitor_for_realtime(1280).ok();
        let screenshot_data_url = capture.as_ref().map(|frame| {
            format!(
                "data:{};base64,{}",
                frame.mime_type,
                base64::engine::general_purpose::STANDARD.encode(&frame.bytes)
            )
        });
        let skill = current_active_skill_name().unwrap_or_else(|| "General guidance".to_owned());
        let instructions = format!(
            "You are Skilly, a concise screen-aware voice teacher. Teach one actionable step at a time using the active skill: {skill}."
        );
        match realtime_client::run_teaching_turn(
            &token.client_secret,
            &token.model,
            &audio.bytes,
            screenshot_data_url,
            &instructions,
        ) {
            Ok(result) => {
                if !result.audio_pcm16.is_empty() {
                    let _ = windows_audio_output::enqueue_pcm16_mono_24k(&result.audio_pcm16);
                }
                runtime.finish_teaching_turn(generation, &result);
                if let Some(frame) = capture {
                    let screen = windows_overlay::ScreenBounds::new(
                        frame.display_origin.x,
                        frame.display_origin.y,
                        frame.display_size.width,
                        frame.display_size.height,
                    );
                    let overlay = windows_overlay::WindowsOverlayAdapter::new(
                        windows_overlay::OverlayInitOptions::new(screen),
                    );
                    let anchor = windows_overlay::ScreenPoint {
                        x: screen.origin_x + screen.width as i32 / 2,
                        y: screen.origin_y + screen.height as i32 / 2,
                    };
                    let _ = overlay.show(windows_overlay::OverlayFrame {
                        cursor: None,
                        transcript: Some(windows_overlay::TranscriptBubble::new(
                            anchor,
                            result.response_text,
                        )),
                    });
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let _ = overlay.hide();
                }
            }
            Err(error) => runtime.fail_teaching_turn(generation, error.to_string()),
        }
        let _ = app_handle.emit("runtime_state_changed", ());
    });
}

fn format_started_at_label(started_at_ms: u64) -> String {
    let elapsed_ms = current_time_ms().saturating_sub(started_at_ms);
    match elapsed_ms {
        0..=4_999 => "Just now".to_owned(),
        5_000..=59_999 => format!("{}s ago", elapsed_ms / 1_000),
        60_000..=3_599_999 => format!("{}m ago", elapsed_ms / 60_000),
        _ => format!("{}h ago", elapsed_ms / 3_600_000),
    }
}

#[tauri::command]
fn list_skills() -> Result<Vec<skills::SkillListItem>, String> {
    skill_store()?
        .list_skill_items()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn seed_bundled_skills() -> Result<skills::SeedBundledSkillsReport, String> {
    skill_store()?
        .seed_bundled_skills()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_skill(source_path: String) -> Result<skills::SkillImportResult, String> {
    if source_path.trim().is_empty() {
        return Err("Choose a SKILL.md file or skill folder first.".to_owned());
    }
    skill_store()?
        .import_skill(&PathBuf::from(source_path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn activate_skill(skill_id: String) -> Result<skills::SkillActivationDto, String> {
    skill_store()?
        .activate_skill(&skill_id, true)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn deactivate_skill() -> Result<skills::SkillActivationDto, String> {
    skill_store()?
        .deactivate_skill()
        .map_err(|error| error.to_string())
}

fn build_app_state(runtime_store: &RuntimeStore) -> app_state::AppState {
    let adapters = StubPlatformAdapters::new();
    let snapshot = adapters.capability_snapshot();
    let capture = microphone_capture_status();
    let turn_snapshot = runtime_store.sync_capture_status(&capture);
    let mut runtime = app_state::AppRuntimeSnapshot {
        build_number: Some(platform::WINDOWS_MINIMUM_BUILD),
        webview2_runtime: Some(true),
        reduced_motion: runtime_store.reduced_motion(),
        live_turn_phase: if turn_snapshot.generation.is_some() || !turn_snapshot.history.is_empty()
        {
            map_turn_phase(turn_snapshot.phase)
        } else {
            live_turn_phase_from_capture(&capture)
        },
        transcript_preview: (!turn_snapshot.transcript_preview.is_empty())
            .then_some(turn_snapshot.transcript_preview.clone()),
        response_preview: (!turn_snapshot.response_preview.is_empty())
            .then_some(turn_snapshot.response_preview.clone()),
        capture_duration_ms: turn_snapshot
            .capture_duration_ms
            .or((capture.state == "committed").then_some(capture.duration_ms)),
        capture_bytes: turn_snapshot
            .capture_bytes
            .map(|value| value as u64)
            .or((capture.state == "committed").then_some(capture.bytes_captured as u64)),
        history_items: turn_snapshot
            .history
            .iter()
            .rev()
            .map(|turn| app_state::ConversationHistoryItem {
                id: turn.id.clone(),
                started_at_label: format_started_at_label(turn.started_at_ms),
                skill_name: turn.skill_name.clone(),
                user_text: turn.user_text.clone(),
                assistant_text: turn.assistant_text.clone(),
                duration_ms: turn.duration_ms,
            })
            .collect(),
        ..app_state::AppRuntimeSnapshot::default()
    };
    if let Ok(session) = runtime_store.auth_session.lock() {
        if let Some(session) = session.as_ref() {
            runtime.account_email = Some(session.email.clone());
            runtime.account_display_name = Some(
                session
                    .email
                    .split('@')
                    .next()
                    .unwrap_or("Skilly user")
                    .to_owned(),
            );
        }
    }
    if let Ok(entitlement) = runtime_store.entitlement.lock() {
        if let Some(entitlement) = entitlement.as_ref() {
            runtime.plan_label = entitlement
                .plan
                .clone()
                .or_else(|| entitlement.entitlement_type.clone());
            runtime.usage_label = Some(if entitlement.status == "active" {
                "Plan active".to_owned()
            } else {
                format!("Plan status: {}", entitlement.status)
            });
        }
    }
    let mut skill_items = Vec::new();
    if let Ok(store) = skill_store() {
        if let Ok(items) = store.list_skill_items() {
            runtime.installed_skill_count = items.len();
            runtime.active_skill_name = items
                .iter()
                .find(|item| item.is_active)
                .map(|item| item.name.clone());
            skill_items = items.into_iter().map(map_skill_item).collect();
        }
    }
    let mut state = app_state::AppState::from_runtime_snapshot(&snapshot, &runtime);
    if !skill_items.is_empty() {
        state.skills.items = skill_items;
    }
    if state.skills.items.is_empty() {
        state.skills.empty_detail =
            "Bundled skills will appear here after the Windows host seeds them.".to_owned();
    }
    state
}

#[tauri::command]
fn get_app_state(runtime_store: tauri::State<'_, RuntimeStore>) -> app_state::AppState {
    build_app_state(&runtime_store)
}

#[tauri::command]
fn set_reduced_motion_preference(
    args: ReducedMotionPreferenceArgs,
    runtime_store: tauri::State<'_, RuntimeStore>,
) -> PanelCommandResult {
    runtime_store.set_reduced_motion(args.reduced_motion);
    PanelCommandResult::ok(if args.reduced_motion {
        "Reduced motion enabled"
    } else {
        "Reduced motion disabled"
    })
}

#[tauri::command]
fn focus_panel() -> PanelCommandResult {
    PanelCommandResult::ok("Panel is already focused")
}

#[tauri::command]
fn open_readiness() -> PanelCommandResult {
    PanelCommandResult::ok("Readiness guidance is available in the Home tab")
}

#[tauri::command]
fn open_account_settings() -> PanelCommandResult {
    PanelCommandResult::ok("Account settings live in the Settings tab")
}

#[tauri::command]
fn open_sign_in(
    runtime_store: tauri::State<'_, RuntimeStore>,
) -> Result<PanelCommandResult, String> {
    let state = fresh_oauth_state()?;
    let now = current_time_ms();
    let pending = auth::PendingOAuthState {
        state: state.clone(),
        next_path: "/".to_owned(),
        issued_at_ms: now,
        expires_at_ms: now + 10 * 60 * 1000,
        intent: auth::AuthIntent::SignIn,
    };
    credential_store::WindowsCredentialStore
        .save_json(AUTH_PENDING_TARGET, None, &pending)
        .map_err(|error| error.to_string())?;
    *runtime_store
        .pending_oauth
        .lock()
        .map_err(|_| "sign-in state unavailable")? = Some(pending);
    let url = backend_client()?
        .fetch_auth_url(&state)
        .map_err(|error| error.to_string())?
        .url;
    open_external_url(&url)?;
    Ok(PanelCommandResult::ok("Sign-in opened in your browser"))
}

#[tauri::command]
fn open_capture_settings() -> PanelCommandResult {
    match open_external_target("ms-settings:display") {
        Ok(message) => PanelCommandResult::ok(message),
        Err(message) => PanelCommandResult {
            status: "error",
            message,
        },
    }
}

#[tauri::command]
fn open_shortcut_settings() -> PanelCommandResult {
    match open_external_target("ms-settings:keyboard") {
        Ok(message) => PanelCommandResult::ok(message),
        Err(message) => PanelCommandResult {
            status: "error",
            message,
        },
    }
}

#[tauri::command]
fn open_overlay_settings() -> PanelCommandResult {
    match open_external_target("ms-settings:easeofaccess-display") {
        Ok(message) => PanelCommandResult::ok(message),
        Err(message) => PanelCommandResult {
            status: "error",
            message,
        },
    }
}

#[tauri::command]
fn open_permissions_settings() -> PanelCommandResult {
    match open_external_target("ms-settings:privacy-microphone") {
        Ok(message) => PanelCommandResult::ok(message),
        Err(message) => PanelCommandResult {
            status: "error",
            message,
        },
    }
}

#[tauri::command]
fn open_audio_input_settings() -> PanelCommandResult {
    match open_external_target("ms-settings:sound") {
        Ok(message) => PanelCommandResult::ok(message),
        Err(message) => PanelCommandResult {
            status: "error",
            message,
        },
    }
}

#[tauri::command]
fn open_audio_output_settings() -> PanelCommandResult {
    open_audio_input_settings()
}

#[tauri::command]
fn open_audio_settings() -> PanelCommandResult {
    open_audio_input_settings()
}

#[tauri::command]
fn open_windows_update() -> PanelCommandResult {
    match open_external_target("ms-settings:windowsupdate") {
        Ok(message) => PanelCommandResult::ok(message),
        Err(message) => PanelCommandResult {
            status: "error",
            message,
        },
    }
}

#[tauri::command]
fn refresh_platform_facts() -> PanelCommandResult {
    PanelCommandResult::ok("Platform facts refreshed")
}

#[tauri::command]
fn install_webview2() -> PanelCommandResult {
    PanelCommandResult::ok("WebView2 installer flow is not wired yet")
}

#[tauri::command]
fn open_skills_folder() -> Result<PanelCommandResult, String> {
    let skills_dir = skill_store()?.skills_dir();
    open_path(&skills_dir)?;
    Ok(PanelCommandResult::ok(format!(
        "Opened skills folder: {}",
        skills_dir.display()
    )))
}

fn open_external_target(target: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|error| format!("failed to open {target}: {error}"))?;
        Ok(format!("Opened {target}"))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|error| format!("failed to open {target}: {error}"))?;
        Ok(format!("Opened {target}"))
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = target;
        Err("opening system settings is unsupported on this platform".to_owned())
    }
}

fn open_path(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| format!("failed to open {}: {error}", path.display()))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("failed to open {}: {error}", path.display()))?;
        Ok(())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = path;
        Err("opening folders is unsupported on this platform".to_owned())
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
struct ModifierChordState {
    active: bool,
}

static PUSH_TO_TALK_ACTIVE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn push_to_talk_active() -> bool {
    PUSH_TO_TALK_ACTIVE.load(Ordering::Relaxed)
}

#[tauri::command]
fn microphone_capture_status() -> MicrophoneCaptureStatus {
    #[cfg(target_os = "windows")]
    {
        windows_audio::current_status()
    }

    #[cfg(not(target_os = "windows"))]
    {
        MicrophoneCaptureStatus {
            state: "unavailable",
            error: Some("Microphone capture is only available on Windows".to_owned()),
            ..MicrophoneCaptureStatus::default()
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum ModifierChordTransition {
    Pressed,
    Released,
}

impl ModifierChordState {
    fn update(&mut self, control_down: bool, alt_down: bool) -> Option<ModifierChordTransition> {
        let next_active = control_down && alt_down;
        if next_active == self.active {
            return None;
        }

        self.active = next_active;
        Some(if next_active {
            ModifierChordTransition::Pressed
        } else {
            ModifierChordTransition::Released
        })
    }
}

#[cfg(target_os = "windows")]
fn start_push_to_talk_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        const VK_CONTROL: i32 = 0x11;
        const VK_MENU: i32 = 0x12;

        #[link(name = "user32")]
        extern "system" {
            fn GetAsyncKeyState(virtual_key: i32) -> i16;
        }

        fn is_key_down(virtual_key: i32) -> bool {
            // The high bit is set while the key is currently held.
            unsafe { GetAsyncKeyState(virtual_key) < 0 }
        }

        let mut chord_state = ModifierChordState::default();
        loop {
            let transition = chord_state.update(is_key_down(VK_CONTROL), is_key_down(VK_MENU));
            match transition {
                Some(ModifierChordTransition::Pressed) => {
                    PUSH_TO_TALK_ACTIVE.store(true, Ordering::Relaxed);
                    app_handle
                        .state::<RuntimeStore>()
                        .begin_turn(current_active_skill_name());
                    windows_audio::start();
                    let _ = app_handle.emit("push_to_talk_pressed", ());
                }
                Some(ModifierChordTransition::Released) => {
                    PUSH_TO_TALK_ACTIVE.store(false, Ordering::Relaxed);
                    windows_audio::stop();
                    let capture = windows_audio::current_status();
                    if let Some(generation) =
                        app_handle.state::<RuntimeStore>().commit_capture(&capture)
                    {
                        process_committed_turn(app_handle.clone(), generation);
                    }
                    let _ = app_handle.emit("push_to_talk_released", ());
                }
                None => {}
            }
            std::thread::sleep(std::time::Duration::from_millis(12));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(callback) = args
                .iter()
                .find(|arg| arg.starts_with("skilly://auth/callback"))
            {
                let result = complete_auth_callback(&app.state::<RuntimeStore>(), callback);
                let _ = app.emit(
                    "auth_state_changed",
                    result.as_ref().map(|_| "signed_in").unwrap_or("error"),
                );
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .manage(RuntimeStore::default())
        .setup(|app| {
            if let Some(session) = load_saved_session() {
                *app.state::<RuntimeStore>()
                    .auth_session
                    .lock()
                    .expect("auth state poisoned") = Some(session);
            }
            #[cfg(all(debug_assertions, target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            for arg in std::env::args() {
                if arg.starts_with("skilly://auth/callback") {
                    let _ = complete_auth_callback(&app.state::<RuntimeStore>(), &arg);
                }
            }
            #[cfg(target_os = "windows")]
            start_push_to_talk_listener(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            activate_skill,
            get_app_state,
            capability_snapshot,
            deactivate_skill,
            focus_panel,
            import_skill,
            install_webview2,
            list_skills,
            open_account_settings,
            open_audio_input_settings,
            open_audio_output_settings,
            open_audio_settings,
            open_capture_settings,
            open_overlay_settings,
            open_permissions_settings,
            open_readiness,
            open_shortcut_settings,
            open_sign_in,
            open_skills_folder,
            open_windows_update,
            push_to_talk_active,
            refresh_platform_facts,
            microphone_capture_status,
            set_reduced_motion_preference,
            seed_bundled_skills
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch Skilly Windows host app");
}

#[cfg(test)]
mod tests {
    use super::{ModifierChordState, ModifierChordTransition};

    #[test]
    fn modifier_chord_emits_only_on_press_and_release_edges() {
        let mut state = ModifierChordState::default();

        assert_eq!(state.update(false, false), None);
        assert_eq!(state.update(true, false), None);
        assert_eq!(
            state.update(true, true),
            Some(ModifierChordTransition::Pressed)
        );
        assert_eq!(state.update(true, true), None);
        assert_eq!(
            state.update(false, true),
            Some(ModifierChordTransition::Released)
        );
        assert_eq!(state.update(false, false), None);
    }
}
