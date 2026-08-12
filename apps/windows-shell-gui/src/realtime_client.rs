use crate::realtime_protocol::{
    parse_server_event_str, InputAudioBufferAppendRequest,
    InputAudioBufferCommitRequest, RealtimeScreenshotInput, RealtimeServerEvent,
    ResponseCreateRequest, ResponseRequest, SessionConfig, SessionUpdateRequest,
    TypedPromptRealtimePayload,
};
use base64::Engine;
use std::fmt::{Display, Formatter};
use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::{connect, Message};

const REALTIME_URL: &str = "wss://api.openai.com/v1/realtime";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TeachingTurnResult {
    pub transcript: String,
    pub response_text: String,
    pub audio_pcm16: Vec<u8>,
}

#[derive(Debug)]
pub enum RealtimeClientError {
    Request(String),
    Connection(String),
    Protocol(String),
    Server(String),
}

impl Display for RealtimeClientError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Request(message)
            | Self::Connection(message)
            | Self::Protocol(message)
            | Self::Server(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for RealtimeClientError {}

pub fn run_teaching_turn(
    client_secret: &str,
    model: &str,
    audio_pcm16: &[u8],
    screenshot_data_url: Option<String>,
    instructions: &str,
) -> Result<TeachingTurnResult, RealtimeClientError> {
    if client_secret.trim().is_empty() || audio_pcm16.is_empty() {
        return Err(RealtimeClientError::Request(
            "Realtime token and captured audio are required".to_owned(),
        ));
    }
    let url = format!(
        "{REALTIME_URL}?model={}",
        url::form_urlencoded::byte_serialize(model.as_bytes()).collect::<String>()
    );
    let mut request = url
        .into_client_request()
        .map_err(|error| RealtimeClientError::Request(error.to_string()))?;
    request.headers_mut().insert(
        "Authorization",
        HeaderValue::from_str(&format!("Bearer {client_secret}"))
            .map_err(|_| RealtimeClientError::Request("invalid Realtime credential".to_owned()))?,
    );
    let (mut socket, _) = connect(request).map_err(|error| {
        RealtimeClientError::Connection(format!("Realtime connection failed: {error}"))
    })?;
    let session = SessionUpdateRequest::new(SessionConfig::teaching_default(
        model.to_owned(),
        Some(instructions.to_owned()),
        None,
        None,
        Vec::new(),
    ));
    send_json(&mut socket, &session)?;

    if let Some(data_url) = screenshot_data_url {
        let payload = TypedPromptRealtimePayload::make(
            "Use this current screen as visual context for the user's spoken question.",
            &[RealtimeScreenshotInput {
                image_data_url: data_url,
                description: "Current primary monitor".to_owned(),
            }],
        );
        for item in payload.conversation_items {
            send_json(&mut socket, &item)?;
        }
    }

    let audio = base64::engine::general_purpose::STANDARD.encode(audio_pcm16);
    send_json(&mut socket, &InputAudioBufferAppendRequest::new(audio))?;
    send_json(&mut socket, &InputAudioBufferCommitRequest::new())?;
    send_json(
        &mut socket,
        &ResponseCreateRequest::new(ResponseRequest::audio_only()),
    )?;

    let mut result = TeachingTurnResult::default();
    loop {
        let message = socket.read().map_err(|error| {
            RealtimeClientError::Connection(format!("Realtime stream ended: {error}"))
        })?;
        let Message::Text(text) = message else {
            continue;
        };
        match parse_server_event_str(&text)
            .map_err(|error| RealtimeClientError::Protocol(error.to_string()))?
        {
            RealtimeServerEvent::InputAudioTranscriptionCompleted { transcript } => {
                result.transcript = transcript
            }
            RealtimeServerEvent::AudioTranscriptDelta { delta } => {
                result.response_text.push_str(&delta)
            }
            RealtimeServerEvent::AudioDelta { delta_base64 } => {
                let decoded = base64::engine::general_purpose::STANDARD
                    .decode(delta_base64)
                    .map_err(|error| {
                        RealtimeClientError::Protocol(format!("invalid audio payload: {error}"))
                    })?;
                result.audio_pcm16.extend(decoded);
            }
            RealtimeServerEvent::ResponseDone { .. } => break,
            RealtimeServerEvent::Error(error) => {
                return Err(RealtimeClientError::Server(error.message))
            }
            _ => {}
        }
    }
    let _ = socket.close(None);
    Ok(result)
}

fn send_json<S: serde::Serialize, Skt: std::io::Read + std::io::Write>(
    socket: &mut tungstenite::WebSocket<Skt>,
    payload: &S,
) -> Result<(), RealtimeClientError> {
    let encoded = serde_json::to_string(payload)
        .map_err(|error| RealtimeClientError::Protocol(error.to_string()))?;
    socket
        .send(Message::Text(encoded.into()))
        .map_err(|error| RealtimeClientError::Connection(error.to_string()))
}
