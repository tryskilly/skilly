use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_REALTIME_MODEL: &str = "gpt-realtime";
pub const DEFAULT_AUDIO_RATE_HZ: u32 = 24_000;
pub const DEFAULT_TRANSCRIPTION_MODEL: &str = "gpt-4o-mini-transcribe";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputModality {
    Audio,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioFormat {
    #[serde(rename = "type")]
    pub kind: String,
    pub rate: u32,
}

impl AudioFormat {
    pub fn pcm_24khz() -> Self {
        Self {
            kind: "audio/pcm".to_owned(),
            rate: DEFAULT_AUDIO_RATE_HZ,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioTranscriptionConfig {
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

impl AudioTranscriptionConfig {
    pub fn new(language: Option<String>) -> Self {
        Self {
            model: DEFAULT_TRANSCRIPTION_MODEL.to_owned(),
            language,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TurnDetectionConfig {
    #[serde(rename = "type")]
    pub kind: String,
    pub threshold: f32,
    pub prefix_padding_ms: u32,
    pub silence_duration_ms: u32,
}

impl TurnDetectionConfig {
    pub fn server_vad() -> Self {
        Self {
            kind: "server_vad".to_owned(),
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FunctionTool {
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionAudioInput {
    pub format: AudioFormat,
    pub transcription: AudioTranscriptionConfig,
    pub turn_detection: Option<TurnDetectionConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionAudioOutput {
    pub format: AudioFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionAudioConfig {
    pub input: SessionAudioInput,
    pub output: SessionAudioOutput,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolChoice {
    Auto,
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionConfig {
    #[serde(rename = "type")]
    pub kind: String,
    pub model: String,
    pub output_modalities: Vec<OutputModality>,
    pub audio: SessionAudioConfig,
    pub tools: Vec<FunctionTool>,
    pub tool_choice: ToolChoice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
}

impl SessionConfig {
    pub fn teaching_default(
        model: impl Into<String>,
        instructions: Option<String>,
        voice: Option<String>,
        transcription_language: Option<String>,
        tools: Vec<FunctionTool>,
    ) -> Self {
        Self {
            kind: "realtime".to_owned(),
            model: model.into(),
            output_modalities: vec![OutputModality::Audio],
            audio: SessionAudioConfig {
                input: SessionAudioInput {
                    format: AudioFormat::pcm_24khz(),
                    transcription: AudioTranscriptionConfig::new(transcription_language),
                    turn_detection: None,
                },
                output: SessionAudioOutput {
                    format: AudioFormat::pcm_24khz(),
                    voice,
                },
            },
            tools,
            tool_choice: ToolChoice::Auto,
            instructions,
        }
    }

    pub fn turn_detection_update(
        model: impl Into<String>,
        turn_detection: Option<TurnDetectionConfig>,
    ) -> Self {
        Self {
            kind: "realtime".to_owned(),
            model: model.into(),
            output_modalities: Vec::new(),
            audio: SessionAudioConfig {
                input: SessionAudioInput {
                    format: AudioFormat::pcm_24khz(),
                    transcription: AudioTranscriptionConfig::new(None),
                    turn_detection,
                },
                output: SessionAudioOutput {
                    format: AudioFormat::pcm_24khz(),
                    voice: None,
                },
            },
            tools: Vec::new(),
            tool_choice: ToolChoice::Auto,
            instructions: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionUpdateRequest {
    #[serde(rename = "type")]
    pub event_type: String,
    pub session: SessionConfig,
}

impl SessionUpdateRequest {
    pub fn new(session: SessionConfig) -> Self {
        Self {
            event_type: "session.update".to_owned(),
            session,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseRequest {
    pub output_modalities: Vec<OutputModality>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
}

impl ResponseRequest {
    pub fn audio_only() -> Self {
        Self {
            output_modalities: vec![OutputModality::Audio],
            tool_choice: None,
            instructions: None,
        }
    }

    pub fn forced_spoken(instructions: impl Into<String>) -> Self {
        Self {
            output_modalities: vec![OutputModality::Audio],
            tool_choice: Some(ToolChoice::None),
            instructions: Some(instructions.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseCreateRequest {
    #[serde(rename = "type")]
    pub event_type: String,
    pub response: ResponseRequest,
}

impl ResponseCreateRequest {
    pub fn new(response: ResponseRequest) -> Self {
        Self {
            event_type: "response.create".to_owned(),
            response,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputAudioBufferAppendRequest {
    #[serde(rename = "type")]
    pub event_type: String,
    pub audio: String,
}

impl InputAudioBufferAppendRequest {
    pub fn new(audio_base64: impl Into<String>) -> Self {
        Self {
            event_type: "input_audio_buffer.append".to_owned(),
            audio: audio_base64.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputAudioBufferCommitRequest {
    #[serde(rename = "type")]
    pub event_type: String,
}

impl InputAudioBufferCommitRequest {
    pub fn new() -> Self {
        Self {
            event_type: "input_audio_buffer.commit".to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputAudioBufferClearRequest {
    #[serde(rename = "type")]
    pub event_type: String,
}

impl InputAudioBufferClearRequest {
    pub fn new() -> Self {
        Self {
            event_type: "input_audio_buffer.clear".to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseCancelRequest {
    #[serde(rename = "type")]
    pub event_type: String,
}

impl ResponseCancelRequest {
    pub fn new() -> Self {
        Self {
            event_type: "response.cancel".to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConversationRole {
    User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageContentPart {
    InputText { text: String },
    InputImage { image_url: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageItem {
    #[serde(rename = "type")]
    pub kind: String,
    pub role: ConversationRole,
    pub content: Vec<MessageContentPart>,
}

impl MessageItem {
    pub fn typed_prompt(text: impl Into<String>) -> Self {
        Self {
            kind: "message".to_owned(),
            role: ConversationRole::User,
            content: vec![MessageContentPart::InputText { text: text.into() }],
        }
    }

    pub fn screenshot(image_data_url: impl Into<String>, description: Option<String>) -> Self {
        let mut content = Vec::new();
        if let Some(description) = description {
            if !description.is_empty() {
                content.push(MessageContentPart::InputText { text: description });
            }
        }
        content.push(MessageContentPart::InputImage {
            image_url: image_data_url.into(),
        });
        Self {
            kind: "message".to_owned(),
            role: ConversationRole::User,
            content,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunctionCallOutputItem {
    #[serde(rename = "type")]
    pub kind: String,
    pub call_id: String,
    pub output: String,
}

impl FunctionCallOutputItem {
    pub fn new(call_id: impl Into<String>, output: impl Into<String>) -> Self {
        Self {
            kind: "function_call_output".to_owned(),
            call_id: call_id.into(),
            output: output.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConversationItem {
    Message(MessageItem),
    FunctionCallOutput(FunctionCallOutputItem),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConversationItemCreateRequest {
    #[serde(rename = "type")]
    pub event_type: String,
    pub item: ConversationItem,
}

impl ConversationItemCreateRequest {
    pub fn new(item: ConversationItem) -> Self {
        Self {
            event_type: "conversation.item.create".to_owned(),
            item,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeScreenshotInput {
    pub image_data_url: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypedPromptRealtimePayload {
    pub conversation_items: Vec<ConversationItemCreateRequest>,
    pub response_request: ResponseCreateRequest,
}

impl TypedPromptRealtimePayload {
    pub fn make(text: impl Into<String>, screenshots: &[RealtimeScreenshotInput]) -> Self {
        let mut conversation_items = screenshots
            .iter()
            .map(|screenshot| {
                ConversationItemCreateRequest::new(ConversationItem::Message(
                    MessageItem::screenshot(
                        screenshot.image_data_url.clone(),
                        Some(screenshot.description.clone()),
                    ),
                ))
            })
            .collect::<Vec<_>>();
        conversation_items.push(ConversationItemCreateRequest::new(
            ConversationItem::Message(MessageItem::typed_prompt(text.into())),
        ));
        Self {
            conversation_items,
            response_request: ResponseCreateRequest::new(ResponseRequest::audio_only()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpenAiRealtimeToken {
    pub client_secret: String,
    pub expires_at: Option<u64>,
    pub model: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RealtimeUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub input_token_details: Option<InputTokenDetails>,
    pub output_token_details: Option<OutputTokenDetails>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputTokenDetails {
    pub cached_tokens: Option<u64>,
    pub audio_tokens: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutputTokenDetails {
    pub audio_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorDisposition {
    BenignNoOp,
    SessionExpired,
    Failure,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeServerError {
    pub code: Option<String>,
    pub message: String,
    pub event_id: Option<String>,
    pub disposition: ErrorDisposition,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RealtimeServerEvent {
    SessionCreated,
    SessionUpdated,
    AudioDelta {
        delta_base64: String,
    },
    AudioTranscriptDelta {
        delta: String,
    },
    InputAudioTranscriptionCompleted {
        transcript: String,
    },
    FunctionCallDone {
        name: String,
        arguments_json: String,
        call_id: String,
    },
    ResponseDone {
        usage: Option<RealtimeUsage>,
    },
    Error(RealtimeServerError),
    SpeechStarted,
    SpeechStopped,
    InputAudioBufferCommitted,
    Unknown {
        event_type: String,
    },
}

pub fn parse_server_event_str(input: &str) -> Result<RealtimeServerEvent, serde_json::Error> {
    let value = serde_json::from_str::<Value>(input)?;
    Ok(parse_server_event_value(value))
}

pub fn parse_server_event_value(value: Value) -> RealtimeServerEvent {
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_owned();

    match event_type.as_str() {
        "session.created" => RealtimeServerEvent::SessionCreated,
        "session.updated" => RealtimeServerEvent::SessionUpdated,
        "response.audio.delta" | "response.output_audio.delta" => {
            match value.get("delta").and_then(Value::as_str) {
                Some(delta) => RealtimeServerEvent::AudioDelta {
                    delta_base64: delta.to_owned(),
                },
                None => RealtimeServerEvent::Unknown { event_type },
            }
        }
        "response.audio_transcript.delta" | "response.output_audio_transcript.delta" => {
            match value.get("delta").and_then(Value::as_str) {
                Some(delta) => RealtimeServerEvent::AudioTranscriptDelta {
                    delta: delta.to_owned(),
                },
                None => RealtimeServerEvent::Unknown { event_type },
            }
        }
        "conversation.item.input_audio_transcription.completed" => {
            match value.get("transcript").and_then(Value::as_str) {
                Some(transcript) => RealtimeServerEvent::InputAudioTranscriptionCompleted {
                    transcript: transcript.to_owned(),
                },
                None => RealtimeServerEvent::Unknown { event_type },
            }
        }
        "response.output_item.done" => {
            parse_function_call_done(value).unwrap_or(RealtimeServerEvent::Unknown { event_type })
        }
        "response.done" => {
            let usage = value
                .get("usage")
                .cloned()
                .and_then(|usage| serde_json::from_value::<RealtimeUsage>(usage).ok());
            RealtimeServerEvent::ResponseDone { usage }
        }
        "error" => parse_error_event(value).unwrap_or(RealtimeServerEvent::Unknown { event_type }),
        "input_audio_buffer.speech_started" => RealtimeServerEvent::SpeechStarted,
        "input_audio_buffer.speech_stopped" => RealtimeServerEvent::SpeechStopped,
        "input_audio_buffer.committed" => RealtimeServerEvent::InputAudioBufferCommitted,
        _ => RealtimeServerEvent::Unknown { event_type },
    }
}

fn parse_function_call_done(value: Value) -> Option<RealtimeServerEvent> {
    let item = value.get("item")?.as_object()?;
    if item.get("type")?.as_str()? != "function_call" {
        return None;
    }
    Some(RealtimeServerEvent::FunctionCallDone {
        name: item.get("name")?.as_str()?.to_owned(),
        arguments_json: item.get("arguments")?.as_str()?.to_owned(),
        call_id: item.get("call_id")?.as_str()?.to_owned(),
    })
}

fn parse_error_event(value: Value) -> Option<RealtimeServerEvent> {
    let error = value.get("error")?.as_object()?;
    let code = error
        .get("code")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| error.get("type").and_then(Value::as_str).map(str::to_owned));
    let message = error.get("message")?.as_str()?.to_owned();
    let event_id = error
        .get("event_id")
        .and_then(Value::as_str)
        .map(str::to_owned);
    Some(RealtimeServerEvent::Error(RealtimeServerError {
        disposition: disposition_for_server_error_code(code.as_deref()),
        code,
        message,
        event_id,
    }))
}

pub fn disposition_for_server_error_code(code: Option<&str>) -> ErrorDisposition {
    match code.unwrap_or_default() {
        "response_cancel_not_active" | "input_audio_buffer_commit_empty" => {
            ErrorDisposition::BenignNoOp
        }
        "session_expired" => ErrorDisposition::SessionExpired,
        _ => ErrorDisposition::Failure,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn point_tool() -> FunctionTool {
        FunctionTool {
            kind: "function".to_owned(),
            name: "point_at_element".to_owned(),
            description: "Point at a UI element.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "x": { "type": "integer" },
                    "y": { "type": "integer" },
                    "label": { "type": "string" }
                },
                "required": ["x", "y", "label"]
            }),
        }
    }

    #[test]
    fn session_update_serializes_current_ga_shape() {
        let event = SessionUpdateRequest::new(SessionConfig::teaching_default(
            "gpt-realtime-2.1",
            Some("Teach the user.".to_owned()),
            Some("alloy".to_owned()),
            Some("en".to_owned()),
            vec![point_tool()],
        ));

        let value = serde_json::to_value(event).expect("session update should serialize");

        assert_eq!(
            value,
            json!({
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "model": "gpt-realtime-2.1",
                    "output_modalities": ["audio"],
                    "audio": {
                        "input": {
                            "format": { "type": "audio/pcm", "rate": 24000 },
                            "transcription": { "model": "gpt-4o-mini-transcribe", "language": "en" },
                            "turn_detection": null
                        },
                        "output": {
                            "format": { "type": "audio/pcm", "rate": 24000 },
                            "voice": "alloy"
                        }
                    },
                    "tools": [{
                        "type": "function",
                        "name": "point_at_element",
                        "description": "Point at a UI element.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "x": { "type": "integer" },
                                "y": { "type": "integer" },
                                "label": { "type": "string" }
                            },
                            "required": ["x", "y", "label"]
                        }
                    }],
                    "tool_choice": "auto",
                    "instructions": "Teach the user."
                }
            })
        );
    }

    #[test]
    fn turn_detection_update_serializes_nested_audio_input_patch() {
        let event = SessionUpdateRequest::new(SessionConfig::turn_detection_update(
            DEFAULT_REALTIME_MODEL,
            Some(TurnDetectionConfig::server_vad()),
        ));

        let value = serde_json::to_value(event).expect("turn detection update should serialize");

        assert_eq!(
            value,
            json!({
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "model": "gpt-realtime",
                    "output_modalities": [],
                    "audio": {
                        "input": {
                            "format": { "type": "audio/pcm", "rate": 24000 },
                            "transcription": { "model": "gpt-4o-mini-transcribe" },
                            "turn_detection": {
                                "type": "server_vad",
                                "threshold": 0.5,
                                "prefix_padding_ms": 300,
                                "silence_duration_ms": 700
                            }
                        },
                        "output": {
                            "format": { "type": "audio/pcm", "rate": 24000 }
                        }
                    },
                    "tools": [],
                    "tool_choice": "auto"
                }
            })
        );
    }

    #[test]
    fn audio_commit_and_response_requests_match_current_shape() {
        let append = serde_json::to_value(InputAudioBufferAppendRequest::new("Zm9v"))
            .expect("append should serialize");
        let commit = serde_json::to_value(InputAudioBufferCommitRequest::new())
            .expect("commit should serialize");
        let response =
            serde_json::to_value(ResponseCreateRequest::new(ResponseRequest::audio_only()))
                .expect("response should serialize");

        assert_eq!(
            append,
            json!({
                "type": "input_audio_buffer.append",
                "audio": "Zm9v"
            })
        );
        assert_eq!(commit, json!({ "type": "input_audio_buffer.commit" }));
        assert_eq!(
            response,
            json!({
                "type": "response.create",
                "response": {
                    "output_modalities": ["audio"]
                }
            })
        );
    }

    #[test]
    fn forced_spoken_response_serializes_tool_choice_none() {
        let response = ResponseCreateRequest::new(ResponseRequest::forced_spoken(
            "Explain the step verbally.",
        ));
        let value = serde_json::to_value(response).expect("forced spoken should serialize");

        assert_eq!(
            value,
            json!({
                "type": "response.create",
                "response": {
                    "output_modalities": ["audio"],
                    "tool_choice": "none",
                    "instructions": "Explain the step verbally."
                }
            })
        );
    }

    #[test]
    fn screenshot_and_function_output_items_serialize() {
        let screenshot =
            ConversationItemCreateRequest::new(ConversationItem::Message(MessageItem::screenshot(
                "data:image/jpeg;base64,abc",
                Some("Screen 1: current app".to_owned()),
            )));
        let function_output =
            ConversationItemCreateRequest::new(ConversationItem::FunctionCallOutput(
                FunctionCallOutputItem::new("call_123", "{\"ok\":true}"),
            ));

        assert_eq!(
            serde_json::to_value(screenshot).expect("screenshot should serialize"),
            json!({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        { "type": "input_text", "text": "Screen 1: current app" },
                        { "type": "input_image", "image_url": "data:image/jpeg;base64,abc" }
                    ]
                }
            })
        );
        assert_eq!(
            serde_json::to_value(function_output).expect("function output should serialize"),
            json!({
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": "call_123",
                    "output": "{\"ok\":true}"
                }
            })
        );
    }

    #[test]
    fn typed_prompt_payload_orders_screenshots_before_question() {
        let payload = TypedPromptRealtimePayload::make(
            "How do I do this?",
            &[RealtimeScreenshotInput {
                image_data_url: "data:image/jpeg;base64,shot".to_owned(),
                description: "Screen 1".to_owned(),
            }],
        );

        assert_eq!(payload.conversation_items.len(), 2);
        assert_eq!(
            serde_json::to_value(&payload.conversation_items[0]).expect("first item serializes"),
            json!({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        { "type": "input_text", "text": "Screen 1" },
                        { "type": "input_image", "image_url": "data:image/jpeg;base64,shot" }
                    ]
                }
            })
        );
        assert_eq!(
            serde_json::to_value(&payload.conversation_items[1]).expect("second item serializes"),
            json!({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        { "type": "input_text", "text": "How do I do this?" }
                    ]
                }
            })
        );
        assert_eq!(
            serde_json::to_value(&payload.response_request).expect("response request serializes"),
            json!({
                "type": "response.create",
                "response": {
                    "output_modalities": ["audio"]
                }
            })
        );
    }

    #[test]
    fn parser_handles_audio_and_transcript_events() {
        let audio = parse_server_event_str(r#"{"type":"response.audio.delta","delta":"UklGRg=="}"#)
            .expect("audio event parses");
        let transcript = parse_server_event_str(
            r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"Open the modifier tab"}"#,
        )
        .expect("transcript event parses");

        assert_eq!(
            audio,
            RealtimeServerEvent::AudioDelta {
                delta_base64: "UklGRg==".to_owned()
            }
        );
        assert_eq!(
            transcript,
            RealtimeServerEvent::InputAudioTranscriptionCompleted {
                transcript: "Open the modifier tab".to_owned()
            }
        );
    }

    #[test]
    fn parser_handles_function_calls_and_usage() {
        let function_call = parse_server_event_str(
            r#"{
                "type":"response.output_item.done",
                "item":{
                    "type":"function_call",
                    "name":"point_at_element",
                    "arguments":"{\"x\":120,\"y\":340,\"label\":\"Bevel\"}",
                    "call_id":"call_abc"
                }
            }"#,
        )
        .expect("function call parses");

        let response_done = parse_server_event_str(
            r#"{
                "type":"response.done",
                "usage":{
                    "input_tokens":100,
                    "output_tokens":40,
                    "total_tokens":140,
                    "input_token_details":{"cached_tokens":10,"audio_tokens":70},
                    "output_token_details":{"audio_tokens":30,"reasoning_tokens":4}
                }
            }"#,
        )
        .expect("response done parses");

        assert_eq!(
            function_call,
            RealtimeServerEvent::FunctionCallDone {
                name: "point_at_element".to_owned(),
                arguments_json: "{\"x\":120,\"y\":340,\"label\":\"Bevel\"}".to_owned(),
                call_id: "call_abc".to_owned(),
            }
        );
        assert_eq!(
            response_done,
            RealtimeServerEvent::ResponseDone {
                usage: Some(RealtimeUsage {
                    input_tokens: Some(100),
                    output_tokens: Some(40),
                    total_tokens: Some(140),
                    input_token_details: Some(InputTokenDetails {
                        cached_tokens: Some(10),
                        audio_tokens: Some(70),
                    }),
                    output_token_details: Some(OutputTokenDetails {
                        audio_tokens: Some(30),
                        reasoning_tokens: Some(4),
                    }),
                })
            }
        );
    }

    #[test]
    fn parser_classifies_benign_and_expired_errors() {
        let benign = parse_server_event_str(
            r#"{"type":"error","error":{"code":"input_audio_buffer_commit_empty","message":"nothing to commit"}}"#,
        )
        .expect("benign error parses");
        let expired = parse_server_event_str(
            r#"{"type":"error","error":{"type":"session_expired","message":"session expired","event_id":"evt_123"}}"#,
        )
        .expect("expired error parses");

        assert_eq!(
            benign,
            RealtimeServerEvent::Error(RealtimeServerError {
                code: Some("input_audio_buffer_commit_empty".to_owned()),
                message: "nothing to commit".to_owned(),
                event_id: None,
                disposition: ErrorDisposition::BenignNoOp,
            })
        );
        assert_eq!(
            expired,
            RealtimeServerEvent::Error(RealtimeServerError {
                code: Some("session_expired".to_owned()),
                message: "session expired".to_owned(),
                event_id: Some("evt_123".to_owned()),
                disposition: ErrorDisposition::SessionExpired,
            })
        );
    }

    #[test]
    fn parser_is_tolerant_of_unknown_events() {
        let unknown =
            parse_server_event_str(r#"{"type":"rate_limits.updated","limits":{"requests":10}}"#)
                .expect("unknown event still parses");

        assert_eq!(
            unknown,
            RealtimeServerEvent::Unknown {
                event_type: "rate_limits.updated".to_owned()
            }
        );
    }
}
