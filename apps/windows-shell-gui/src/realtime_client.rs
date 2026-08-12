use crate::realtime_protocol::{
    parse_server_event_str, ConversationItem, ConversationItemCreateRequest,
    FunctionCallOutputItem, FunctionTool, InputAudioBufferAppendRequest,
    InputAudioBufferCommitRequest, RealtimeScreenshotInput, RealtimeServerEvent,
    ResponseCreateRequest, ResponseRequest, SessionConfig, SessionUpdateRequest,
    TypedPromptRealtimePayload,
};
use base64::Engine;
use std::fmt::{Display, Formatter};
use std::net::TcpStream;
use std::time::Duration;
use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message};

const REALTIME_URL: &str = "wss://api.openai.com/v1/realtime";
const AUDIO_CHUNK_BYTES: usize = 48_000;
const REALTIME_IO_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Default, PartialEq)]
pub struct TeachingTurnResult {
    pub transcript: String,
    pub response_text: String,
    pub audio_pcm16: Vec<u8>,
    pub point: Option<TeachingPoint>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TeachingPoint {
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub label: String,
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
    configure_timeout(socket.get_mut())?;
    let pointing_tool = FunctionTool {
        kind: "function".to_owned(),
        name: "point_at_screen".to_owned(),
        description: "Point at the exact visible UI element the user should use next.".to_owned(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "normalized_x": { "type": "number", "minimum": 0, "maximum": 1 },
                "normalized_y": { "type": "number", "minimum": 0, "maximum": 1 },
                "label": { "type": "string" }
            },
            "required": ["normalized_x", "normalized_y", "label"],
            "additionalProperties": false
        }),
    };
    let session = SessionUpdateRequest::new(SessionConfig::teaching_default(
        model.to_owned(),
        Some(instructions.to_owned()),
        None,
        None,
        vec![pointing_tool],
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

    for chunk in audio_pcm16.chunks(AUDIO_CHUNK_BYTES) {
        let audio = base64::engine::general_purpose::STANDARD.encode(chunk);
        send_json(&mut socket, &InputAudioBufferAppendRequest::new(audio))?;
    }
    send_json(&mut socket, &InputAudioBufferCommitRequest::new())?;
    send_json(
        &mut socket,
        &ResponseCreateRequest::new(ResponseRequest::audio_only()),
    )?;

    let mut result = TeachingTurnResult::default();
    let mut waiting_for_spoken_followup = false;
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
            RealtimeServerEvent::FunctionCallDone {
                name,
                arguments_json,
                call_id,
            } if name == "point_at_screen" => {
                if let Some(point) = parse_teaching_point(&arguments_json) {
                    result.point = Some(point);
                }
                send_json(
                    &mut socket,
                    &ConversationItemCreateRequest::new(ConversationItem::FunctionCallOutput(
                        FunctionCallOutputItem::new(call_id, "{\"ok\":true}"),
                    )),
                )?;
                send_json(
                    &mut socket,
                    &ResponseCreateRequest::new(ResponseRequest::forced_spoken(
                        "Briefly explain the highlighted next step without calling another tool.",
                    )),
                )?;
                waiting_for_spoken_followup = true;
            }
            RealtimeServerEvent::ResponseDone { .. } if waiting_for_spoken_followup => break,
            RealtimeServerEvent::ResponseDone { .. } if result.point.is_none() => break,
            RealtimeServerEvent::ResponseDone { .. } => {}
            RealtimeServerEvent::Error(error) => {
                return Err(RealtimeClientError::Server(error.message))
            }
            _ => {}
        }
    }
    let _ = socket.close(None);
    Ok(result)
}

fn parse_teaching_point(arguments_json: &str) -> Option<TeachingPoint> {
    let value = serde_json::from_str::<serde_json::Value>(arguments_json).ok()?;
    let normalized_x = value.get("normalized_x")?.as_f64()?.clamp(0.0, 1.0);
    let normalized_y = value.get("normalized_y")?.as_f64()?.clamp(0.0, 1.0);
    let label = value
        .get("label")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Next step")
        .chars()
        .take(96)
        .collect();
    Some(TeachingPoint {
        normalized_x,
        normalized_y,
        label,
    })
}

fn configure_timeout(stream: &mut MaybeTlsStream<TcpStream>) -> Result<(), RealtimeClientError> {
    let socket = match stream {
        MaybeTlsStream::Plain(socket) => socket,
        MaybeTlsStream::Rustls(stream) => stream.get_mut(),
        _ => return Ok(()),
    };
    socket
        .set_read_timeout(Some(REALTIME_IO_TIMEOUT))
        .and_then(|_| socket.set_write_timeout(Some(REALTIME_IO_TIMEOUT)))
        .map_err(|error| {
            RealtimeClientError::Connection(format!("Realtime timeout setup failed: {error}"))
        })
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

#[cfg(test)]
mod tests {
    use super::{parse_teaching_point, AUDIO_CHUNK_BYTES};

    #[test]
    fn teaching_point_is_bounded_and_labeled() {
        let point =
            parse_teaching_point(r#"{"normalized_x":1.4,"normalized_y":-0.2,"label":"Bevel"}"#)
                .expect("point should parse");
        assert_eq!(point.normalized_x, 1.0);
        assert_eq!(point.normalized_y, 0.0);
        assert_eq!(point.label, "Bevel");
    }

    #[test]
    fn audio_chunks_remain_realtime_friendly() {
        let bytes = vec![1_u8; AUDIO_CHUNK_BYTES * 2 + 7];
        assert_eq!(
            bytes
                .chunks(AUDIO_CHUNK_BYTES)
                .map(<[u8]>::len)
                .collect::<Vec<_>>(),
            vec![AUDIO_CHUNK_BYTES, AUDIO_CHUNK_BYTES, 7]
        );
    }
}
