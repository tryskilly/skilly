use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

const DEFAULT_WORKER_BASE_URL: &str = "https://skilly-proxy.eng-mohamedszaied.workers.dev";
const MAX_PUBLIC_ERROR_LEN: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
}

impl HttpMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            HttpMethod::Get => "GET",
            HttpMethod::Post => "POST",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendRequest {
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

impl BackendRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub fn body_as_str(&self) -> Option<&str> {
        self.body
            .as_deref()
            .and_then(|body| std::str::from_utf8(body).ok())
    }

    pub fn redacted_summary(&self) -> String {
        let mut parts = vec![self.method.as_str().to_owned(), self.url.clone()];
        if !self.headers.is_empty() {
            let headers = self
                .headers
                .iter()
                .map(|(name, value)| {
                    if name.eq_ignore_ascii_case("authorization") {
                        format!("{name}=<redacted>")
                    } else {
                        format!("{name}={value}")
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");
            parts.push(format!("[{headers}]"));
        }
        if let Some(body) = self.body_as_str() {
            parts.push(redact_json_secrets(body));
        }
        parts.join(" ")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl BackendResponse {
    pub fn json<T: for<'de> Deserialize<'de>>(&self) -> Result<T, BackendClientError> {
        serde_json::from_slice(&self.body)
            .map_err(|error| BackendClientError::Decode(format!("invalid json response: {error}")))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransportError {
    message: String,
}

impl TransportError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for TransportError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for TransportError {}

pub trait BackendTransport {
    fn send(&self, request: BackendRequest) -> Result<BackendResponse, TransportError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendClientError {
    InvalidBaseUrl,
    InvalidArgument(&'static str),
    Transport(String),
    Http {
        status: u16,
        route: &'static str,
        public_message: Option<String>,
    },
    Decode(String),
}

impl Display for BackendClientError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            BackendClientError::InvalidBaseUrl => formatter.write_str("worker base url is invalid"),
            BackendClientError::InvalidArgument(message) => formatter.write_str(message),
            BackendClientError::Transport(message) | BackendClientError::Decode(message) => {
                formatter.write_str(message)
            }
            BackendClientError::Http {
                status,
                route,
                public_message,
            } => {
                write!(formatter, "{route} failed with status {status}")?;
                if let Some(message) = public_message {
                    write!(formatter, ": {message}")?;
                }
                Ok(())
            }
        }
    }
}

impl std::error::Error for BackendClientError {}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerUser {
    pub id: String,
    pub email: String,
    #[serde(default)]
    pub first_name: Option<String>,
    #[serde(default)]
    pub last_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthUrlResponse {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthCodeExchangeRequest {
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RefreshTokenExchangeRequest {
    pub grant_type: String,
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokenResponse {
    pub user: WorkerUser,
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub session_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntitlementResponse {
    pub user_id: String,
    pub status: String,
    #[serde(default)]
    pub entitlement_type: Option<String>,
    #[serde(default)]
    pub period_start: Option<String>,
    #[serde(default)]
    pub period_end: Option<String>,
    #[serde(default)]
    pub plan: Option<String>,
    #[serde(default)]
    pub polar_customer_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CheckoutCreateRequest {
    pub user_id: String,
    pub email: String,
    pub checkout_attempt_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CheckoutCreateResponse {
    pub checkout_url: String,
    #[serde(default)]
    pub checkout_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PortalResponse {
    pub portal_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiTokenResponse {
    pub client_secret: String,
    pub expires_at: u64,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct BackendClient<T> {
    base_url: String,
    transport: T,
}

impl<T> BackendClient<T> {
    pub fn new(base_url: impl Into<String>, transport: T) -> Result<Self, BackendClientError> {
        let base_url = normalize_base_url(&base_url.into())?;
        Ok(Self {
            base_url,
            transport,
        })
    }

    pub fn with_default_base_url(transport: T) -> Result<Self, BackendClientError> {
        Self::new(DEFAULT_WORKER_BASE_URL, transport)
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

impl<T> BackendClient<T>
where
    T: BackendTransport,
{
    pub fn fetch_auth_url(&self, state: &str) -> Result<AuthUrlResponse, BackendClientError> {
        ensure_non_empty(state, "oauth state is required")?;
        let request = self.get("/auth/url", &[("state", state)], None, "auth/url")?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "auth/url")
    }

    pub fn exchange_auth_code(&self, code: &str) -> Result<AuthTokenResponse, BackendClientError> {
        ensure_non_empty(code, "auth code is required")?;
        let payload = AuthCodeExchangeRequest {
            code: code.to_owned(),
        };
        let request = self.post_json("/auth/token", &payload, None, "auth/token")?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "auth/token")
    }

    pub fn refresh_session(
        &self,
        refresh_token: &str,
    ) -> Result<AuthTokenResponse, BackendClientError> {
        ensure_non_empty(refresh_token, "refresh token is required")?;
        let payload = RefreshTokenExchangeRequest {
            grant_type: "refresh_token".to_owned(),
            refresh_token: refresh_token.to_owned(),
        };
        let request = self.post_json("/auth/token", &payload, None, "auth/token")?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "auth/token")
    }

    pub fn fetch_entitlement(
        &self,
        session_token: &str,
    ) -> Result<EntitlementResponse, BackendClientError> {
        let request = self.get("/entitlement", &[], Some(session_token), "entitlement")?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "entitlement")
    }

    pub fn create_checkout(
        &self,
        session_token: &str,
        payload: &CheckoutCreateRequest,
    ) -> Result<CheckoutCreateResponse, BackendClientError> {
        ensure_non_empty(&payload.user_id, "checkout user id is required")?;
        ensure_non_empty(&payload.email, "checkout email is required")?;
        ensure_non_empty(
            &payload.checkout_attempt_id,
            "checkout attempt id is required",
        )?;
        let request = self.post_json(
            "/checkout/create",
            payload,
            Some(session_token),
            "checkout/create",
        )?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "checkout/create")
    }

    pub fn open_portal(
        &self,
        session_token: &str,
        email: Option<&str>,
    ) -> Result<PortalResponse, BackendClientError> {
        let request = self.get(
            "/portal",
            &email
                .filter(|value| !value.trim().is_empty())
                .map(|value| vec![("email", value)])
                .unwrap_or_default(),
            Some(session_token),
            "portal",
        )?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "portal")
    }

    pub fn fetch_openai_token(
        &self,
        session_token: &str,
        model: Option<&str>,
    ) -> Result<OpenAiTokenResponse, BackendClientError> {
        let request = self.get(
            "/openai/token",
            &model
                .filter(|value| !value.trim().is_empty())
                .map(|value| vec![("model", value)])
                .unwrap_or_default(),
            Some(session_token),
            "openai/token",
        )?;
        let response = self.transport.send(request).map_err(transport_error)?;
        decode_json_response(response, "openai/token")
    }

    fn get(
        &self,
        path: &'static str,
        query: &[(&str, &str)],
        session_token: Option<&str>,
        _route: &'static str,
    ) -> Result<BackendRequest, BackendClientError> {
        Ok(BackendRequest {
            method: HttpMethod::Get,
            url: build_url(&self.base_url, path, query)?,
            headers: build_headers(session_token)?,
            body: None,
        })
    }

    fn post_json<S: Serialize>(
        &self,
        path: &'static str,
        payload: &S,
        session_token: Option<&str>,
        route: &'static str,
    ) -> Result<BackendRequest, BackendClientError> {
        let mut headers = build_headers(session_token)?;
        headers.push(("Content-Type".to_owned(), "application/json".to_owned()));
        let body = serde_json::to_vec(payload).map_err(|error| {
            BackendClientError::Decode(format!("{route} request encode failed: {error}"))
        })?;
        Ok(BackendRequest {
            method: HttpMethod::Post,
            url: build_url(&self.base_url, path, &[])?,
            headers,
            body: Some(body),
        })
    }
}

fn build_headers(session_token: Option<&str>) -> Result<Vec<(String, String)>, BackendClientError> {
    let mut headers = Vec::new();
    if let Some(token) = session_token {
        ensure_non_empty(token, "session token is required")?;
        headers.push(("Authorization".to_owned(), format!("Bearer {token}")));
    }
    Ok(headers)
}

fn decode_json_response<T: for<'de> Deserialize<'de>>(
    response: BackendResponse,
    route: &'static str,
) -> Result<T, BackendClientError> {
    if !(200..=299).contains(&response.status) {
        return Err(BackendClientError::Http {
            status: response.status,
            route,
            public_message: extract_public_error_message(&response.body),
        });
    }
    response.json()
}

fn normalize_base_url(raw: &str) -> Result<String, BackendClientError> {
    let trimmed = raw.trim().trim_end_matches('/');
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err(BackendClientError::InvalidBaseUrl);
    }
    if trimmed.len() <= "https://".len() {
        return Err(BackendClientError::InvalidBaseUrl);
    }
    Ok(trimmed.to_owned())
}

fn build_url(
    base_url: &str,
    path: &str,
    query: &[(&str, &str)],
) -> Result<String, BackendClientError> {
    if !path.starts_with('/') {
        return Err(BackendClientError::InvalidArgument(
            "route path must start with '/'",
        ));
    }

    let mut url = format!("{base_url}{path}");
    if !query.is_empty() {
        let rendered = query
            .iter()
            .map(|(key, value)| format!("{}={}", percent_encode(key), percent_encode(value)))
            .collect::<Vec<_>>()
            .join("&");
        url.push('?');
        url.push_str(&rendered);
    }
    Ok(url)
}

fn ensure_non_empty(value: &str, message: &'static str) -> Result<(), BackendClientError> {
    if value.trim().is_empty() {
        return Err(BackendClientError::InvalidArgument(message));
    }
    Ok(())
}

fn transport_error(error: TransportError) -> BackendClientError {
    BackendClientError::Transport(error.to_string())
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        let allowed = matches!(
            byte,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~'
        );
        if allowed {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(hex_digit(byte >> 4));
            encoded.push(hex_digit(byte & 0x0f));
        }
    }
    encoded
}

fn hex_digit(value: u8) -> char {
    match value & 0x0f {
        0..=9 => (b'0' + (value & 0x0f)) as char,
        10..=15 => (b'A' + ((value & 0x0f) - 10)) as char,
        _ => unreachable!(),
    }
}

fn extract_public_error_message(body: &[u8]) -> Option<String> {
    let parsed = serde_json::from_slice::<BTreeMap<String, serde_json::Value>>(body).ok()?;
    let raw = parsed.get("error")?.as_str()?.trim();
    if raw.is_empty() {
        return None;
    }
    let sanitized = redact_inline_secret_like_values(raw);
    Some(truncate_message(&sanitized, MAX_PUBLIC_ERROR_LEN))
}

fn truncate_message(value: &str, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        return value.to_owned();
    }
    value.chars().take(max_len).collect::<String>() + "…"
}

fn redact_json_secrets(body: &str) -> String {
    let mut redacted = body.to_owned();
    for key in [
        "access_token",
        "refresh_token",
        "session_token",
        "clientSecret",
        "client_secret",
        "code",
    ] {
        let quoted_key = format!("\"{key}\":\"");
        if let Some(start) = redacted.find(&quoted_key) {
            let value_start = start + quoted_key.len();
            if let Some(end) = redacted[value_start..].find('"') {
                redacted.replace_range(value_start..value_start + end, "<redacted>");
            }
        }
    }
    redacted
}

fn redact_inline_secret_like_values(value: &str) -> String {
    value
        .split_whitespace()
        .map(|part| {
            if part.starts_with("Bearer ") || looks_like_secret(part) {
                "<redacted>".to_owned()
            } else {
                part.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn looks_like_secret(value: &str) -> bool {
    let trimmed = value.trim_matches(|character: char| {
        !character.is_ascii_alphanumeric() && character != '_' && character != '-'
    });
    trimmed.len() >= 24
        && trimmed.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::VecDeque;

    #[derive(Debug, Default)]
    struct MockTransport {
        requests: RefCell<Vec<BackendRequest>>,
        responses: RefCell<VecDeque<Result<BackendResponse, TransportError>>>,
    }

    impl MockTransport {
        fn push_json_response(&self, status: u16, body: &str) {
            self.responses.borrow_mut().push_back(Ok(BackendResponse {
                status,
                headers: vec![("content-type".to_owned(), "application/json".to_owned())],
                body: body.as_bytes().to_vec(),
            }));
        }

        fn requests(&self) -> Vec<BackendRequest> {
            self.requests.borrow().clone()
        }
    }

    impl BackendTransport for MockTransport {
        fn send(&self, request: BackendRequest) -> Result<BackendResponse, TransportError> {
            self.requests.borrow_mut().push(request);
            self.responses
                .borrow_mut()
                .pop_front()
                .unwrap_or_else(|| Err(TransportError::new("no queued response")))
        }
    }

    #[test]
    fn fetch_auth_url_builds_worker_route_request() {
        let transport = MockTransport::default();
        transport.push_json_response(200, r#"{"url":"https://api.workos.com/..."}"#);
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let response = client.fetch_auth_url("state_123").expect("response");

        assert_eq!(response.url, "https://api.workos.com/...");
        let requests = client.transport.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, HttpMethod::Get);
        assert_eq!(
            requests[0].url,
            "https://skilly-proxy.eng-mohamedszaied.workers.dev/auth/url?state=state_123"
        );
        assert!(requests[0].body.is_none());
    }

    #[test]
    fn exchange_auth_code_posts_json_without_leaking_summary() {
        let transport = MockTransport::default();
        transport.push_json_response(
            200,
            r#"{
                "user":{"id":"user_123","email":"person@example.com","firstName":"Ada","lastName":"Lovelace"},
                "accessToken":"access_secret_12345678901234567890",
                "refreshToken":"refresh_secret_12345678901234567890",
                "sessionToken":"session_secret_12345678901234567890"
            }"#,
        );
        let client = BackendClient::with_default_base_url(transport).expect("client");

        let response = client
            .exchange_auth_code("auth_code_123")
            .expect("response");
        assert_eq!(response.user.id, "user_123");
        assert_eq!(
            response.session_token,
            "session_secret_12345678901234567890"
        );

        let request = client.transport.requests().pop().expect("request");
        assert_eq!(request.method, HttpMethod::Post);
        assert_eq!(request.body_as_str(), Some(r#"{"code":"auth_code_123"}"#));
        let summary = request.redacted_summary();
        assert!(summary.contains(r#""code":"<redacted>""#));
        assert!(!summary.contains("auth_code_123"));
    }

    #[test]
    fn refresh_session_posts_refresh_grant_shape() {
        let transport = MockTransport::default();
        transport.push_json_response(
            200,
            r#"{
                "user":{"id":"user_123","email":"person@example.com"},
                "accessToken":"access_123",
                "refreshToken":"refresh_456",
                "sessionToken":"session_789"
            }"#,
        );
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let response = client.refresh_session("refresh_123").expect("response");

        assert_eq!(response.refresh_token.as_deref(), Some("refresh_456"));
        assert_eq!(
            client.transport.requests()[0].body_as_str(),
            Some(r#"{"grant_type":"refresh_token","refresh_token":"refresh_123"}"#)
        );
    }

    #[test]
    fn fetch_entitlement_adds_bearer_header() {
        let transport = MockTransport::default();
        transport.push_json_response(
            200,
            r#"{"user_id":"user_123","status":"active","entitlement_type":"relay","plan":"beta"}"#,
        );
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let response = client.fetch_entitlement("session_123").expect("response");

        assert_eq!(response.user_id, "user_123");
        let request = client.transport.requests()[0].clone();
        assert_eq!(request.header("authorization"), Some("Bearer session_123"));
        assert!(request
            .redacted_summary()
            .contains("Authorization=<redacted>"));
        assert!(!request.redacted_summary().contains("session_123"));
    }

    #[test]
    fn create_checkout_uses_expected_payload() {
        let transport = MockTransport::default();
        transport.push_json_response(
            200,
            r#"{"checkout_url":"https://polar.sh/checkout/123","checkout_id":"checkout_123"}"#,
        );
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let response = client
            .create_checkout(
                "session_123",
                &CheckoutCreateRequest {
                    user_id: "user_123".to_owned(),
                    email: "person@example.com".to_owned(),
                    checkout_attempt_id: "attempt_123".to_owned(),
                },
            )
            .expect("response");

        assert_eq!(response.checkout_id.as_deref(), Some("checkout_123"));
        assert_eq!(
            client.transport.requests()[0].body_as_str(),
            Some(
                r#"{"user_id":"user_123","email":"person@example.com","checkout_attempt_id":"attempt_123"}"#
            )
        );
    }

    #[test]
    fn open_portal_can_include_email_query() {
        let transport = MockTransport::default();
        transport.push_json_response(200, r#"{"portal_url":"https://polar.sh/portal/123"}"#);
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let response = client
            .open_portal("session_123", Some("person@example.com"))
            .expect("response");

        assert_eq!(response.portal_url, "https://polar.sh/portal/123");
        assert_eq!(
            client.transport.requests()[0].url,
            "https://skilly-proxy.eng-mohamedszaied.workers.dev/portal?email=person%40example.com"
        );
    }

    #[test]
    fn fetch_openai_token_supports_optional_model_query() {
        let transport = MockTransport::default();
        transport.push_json_response(
            200,
            r#"{"clientSecret":"secret_123","expiresAt":123456,"model":"gpt-realtime-2.1-mini"}"#,
        );
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let response = client
            .fetch_openai_token("session_123", Some("gpt-realtime-2.1-mini"))
            .expect("response");

        assert_eq!(response.client_secret, "secret_123");
        assert_eq!(
            client.transport.requests()[0].url,
            "https://skilly-proxy.eng-mohamedszaied.workers.dev/openai/token?model=gpt-realtime-2.1-mini"
        );
    }

    #[test]
    fn non_success_status_uses_public_error_without_echoing_secret() {
        let transport = MockTransport::default();
        transport.push_json_response(
            401,
            r#"{"error":"worker session stale session_123456789012345678901234"}"#,
        );
        let client = BackendClient::with_default_base_url(transport).expect("client");
        let error = client.fetch_entitlement("session_123").expect_err("error");

        match error {
            BackendClientError::Http {
                status,
                route,
                public_message,
            } => {
                assert_eq!(status, 401);
                assert_eq!(route, "entitlement");
                let message = public_message.expect("message");
                assert!(message.contains("worker"));
                assert!(!message.contains("session_123456789012345678901234"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn invalid_base_url_is_rejected() {
        let error =
            BackendClient::new("skilly-proxy", MockTransport::default()).expect_err("invalid");
        assert!(matches!(error, BackendClientError::InvalidBaseUrl));
    }
}
