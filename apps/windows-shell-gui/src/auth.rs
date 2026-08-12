use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};
#[cfg(not(target_os = "windows"))]
use std::fs::File;
#[cfg(not(target_os = "windows"))]
use std::io::Read;

const DEFAULT_STATE_BYTES: usize = 32;
const DEFAULT_STATE_TTL_MS: u64 = 10 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    InvalidArgument(&'static str),
    InvalidCallback(&'static str),
    MissingState,
    ExpiredState,
    ReplayDetected,
    Upstream(String),
    Io(String),
    Storage(String),
}

impl Display for AuthError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::InvalidArgument(message) => formatter.write_str(message),
            AuthError::InvalidCallback(message) => formatter.write_str(message),
            AuthError::MissingState => formatter.write_str("missing oauth state"),
            AuthError::ExpiredState => formatter.write_str("oauth state expired"),
            AuthError::ReplayDetected => formatter.write_str("oauth state already used"),
            AuthError::Upstream(message) => formatter.write_str(message),
            AuthError::Io(message) | AuthError::Storage(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for AuthError {}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthIntent {
    SignIn,
    SignUp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkosAuthMethod {
    Email,
    Google,
}

impl WorkosAuthMethod {
    pub fn provider(self) -> &'static str {
        match self {
            WorkosAuthMethod::Email => "authkit",
            WorkosAuthMethod::Google => "GoogleOAuth",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingOAuthState {
    pub state: String,
    pub next_path: String,
    pub issued_at_ms: u64,
    pub expires_at_ms: u64,
    pub intent: AuthIntent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

impl OAuthCallbackQuery {
    pub fn auth_code(&self) -> Result<&str, AuthError> {
        if let Some(error) = self.error.as_deref() {
            return Err(AuthError::Upstream(
                match self.error_description.as_deref() {
                    Some(description) if !description.is_empty() => {
                        format!("{error}: {description}")
                    }
                    _ => error.to_owned(),
                },
            ));
        }
        self.code.as_deref().ok_or(AuthError::InvalidCallback(
            "callback did not include an auth code",
        ))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthExchangeRequest {
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthExchangeResponse {
    pub session_token: String,
    pub expires_at: u64,
    pub email: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSessionRequest {
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSessionResponse {
    pub session_token: String,
    pub expires_at: u64,
    #[serde(default)]
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAuthSession {
    pub email: String,
    pub session_token: String,
    pub expires_at: u64,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
}

impl PersistedAuthSession {
    pub fn from_exchange(response: AuthExchangeResponse) -> Self {
        Self {
            email: response.email,
            session_token: response.session_token,
            expires_at: response.expires_at,
            refresh_token: response.refresh_token,
            user_id: response.user_id,
        }
    }

    pub fn apply_refresh(&mut self, response: RefreshSessionResponse) {
        self.session_token = response.session_token;
        self.expires_at = response.expires_at;
        if response.refresh_token.is_some() {
            self.refresh_token = response.refresh_token;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntitlementRecord {
    pub user_id: String,
    pub status: String,
    pub entitlement_type: Option<String>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub plan: Option<String>,
    pub polar_customer_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiTokenResponse {
    pub client_secret: String,
    pub expires_at: Option<u64>,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CheckoutUrlResponse {
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthFlowState {
    SignedOut,
    AwaitingBrowserCallback(PendingOAuthState),
    ExchangingCode {
        pending: PendingOAuthState,
        code: String,
    },
    Authenticated(PersistedAuthSession),
    Refreshing(PersistedAuthSession),
    Error(String),
}

impl Default for AuthFlowState {
    fn default() -> Self {
        Self::SignedOut
    }
}

impl AuthFlowState {
    pub fn authorization_started(self, pending: PendingOAuthState) -> Self {
        let _ = self;
        Self::AwaitingBrowserCallback(pending)
    }

    pub fn callback_received(self, callback: OAuthCallbackQuery) -> Result<Self, AuthError> {
        match self {
            Self::AwaitingBrowserCallback(pending) => Ok(Self::ExchangingCode {
                pending,
                code: callback.auth_code()?.to_owned(),
            }),
            _ => Err(AuthError::InvalidCallback(
                "received browser callback while auth flow was not waiting for one",
            )),
        }
    }

    pub fn exchange_succeeded(self, session: PersistedAuthSession) -> Result<Self, AuthError> {
        match self {
            Self::ExchangingCode { .. } => Ok(Self::Authenticated(session)),
            _ => Err(AuthError::InvalidCallback(
                "auth exchange succeeded outside the exchanging state",
            )),
        }
    }

    pub fn refresh_started(self) -> Result<Self, AuthError> {
        match self {
            Self::Authenticated(session) => Ok(Self::Refreshing(session)),
            _ => Err(AuthError::InvalidCallback(
                "cannot start refresh without an authenticated session",
            )),
        }
    }

    pub fn refresh_succeeded(self, response: RefreshSessionResponse) -> Result<Self, AuthError> {
        match self {
            Self::Refreshing(mut session) => {
                session.apply_refresh(response);
                Ok(Self::Authenticated(session))
            }
            _ => Err(AuthError::InvalidCallback(
                "refresh completed while the auth flow was not refreshing",
            )),
        }
    }

    pub fn fail(self, message: impl Into<String>) -> Self {
        let _ = self;
        Self::Error(message.into())
    }

    pub fn sign_out(self) -> Self {
        let _ = self;
        Self::SignedOut
    }
}

pub trait OAuthStateStore {
    fn save_pending_state(&self, pending: &PendingOAuthState) -> Result<(), AuthError>;
    fn take_pending_state(&self, state: &str) -> Result<Option<PendingOAuthState>, AuthError>;
}

pub trait OAuthEntropySource {
    fn fill_bytes(&self, buffer: &mut [u8]) -> Result<(), AuthError>;
}

pub struct OAuthStateCoordinator<S, E> {
    store: S,
    entropy: E,
    ttl_ms: u64,
    state_bytes: usize,
}

impl<S, E> OAuthStateCoordinator<S, E>
where
    S: OAuthStateStore,
    E: OAuthEntropySource,
{
    pub fn new(store: S, entropy: E) -> Self {
        Self {
            store,
            entropy,
            ttl_ms: DEFAULT_STATE_TTL_MS,
            state_bytes: DEFAULT_STATE_BYTES,
        }
    }

    pub fn with_ttl_ms(mut self, ttl_ms: u64) -> Self {
        self.ttl_ms = ttl_ms.max(1);
        self
    }

    pub fn with_state_bytes(mut self, state_bytes: usize) -> Self {
        self.state_bytes = state_bytes.max(16);
        self
    }

    pub fn begin_authorization(
        &self,
        next_path: &str,
        intent: AuthIntent,
        now_ms: u64,
    ) -> Result<PendingOAuthState, AuthError> {
        let mut random_bytes = vec![0_u8; self.state_bytes];
        self.entropy.fill_bytes(&mut random_bytes)?;
        let state = hex_encode(&random_bytes);
        let pending = PendingOAuthState {
            state,
            next_path: sanitize_next_path(next_path),
            issued_at_ms: now_ms,
            expires_at_ms: now_ms.saturating_add(self.ttl_ms),
            intent,
        };
        self.store.save_pending_state(&pending)?;
        Ok(pending)
    }

    pub fn validate_returned_state(
        &self,
        state: &str,
        now_ms: u64,
    ) -> Result<PendingOAuthState, AuthError> {
        if state.trim().is_empty() {
            return Err(AuthError::MissingState);
        }
        let pending = self
            .store
            .take_pending_state(state)?
            .ok_or(AuthError::ReplayDetected)?;
        if pending.expires_at_ms < now_ms {
            return Err(AuthError::ExpiredState);
        }
        Ok(pending)
    }
}

pub fn build_workos_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    method: WorkosAuthMethod,
) -> Result<String, AuthError> {
    if client_id.trim().is_empty() {
        return Err(AuthError::InvalidArgument("workos client id is required"));
    }
    if redirect_uri.trim().is_empty() {
        return Err(AuthError::InvalidArgument(
            "workos redirect uri is required",
        ));
    }
    if state.trim().is_empty() {
        return Err(AuthError::InvalidArgument("oauth state is required"));
    }

    Ok(format!(
        "https://api.workos.com/user_management/authorize?client_id={}&redirect_uri={}&response_type=code&provider={}&state={}",
        url_encode(client_id),
        url_encode(redirect_uri),
        url_encode(method.provider()),
        url_encode(state)
    ))
}

pub fn parse_oauth_callback(input: &str) -> Result<OAuthCallbackQuery, AuthError> {
    let query = if let Some(query_index) = input.find('?') {
        &input[query_index + 1..]
    } else {
        input
    };
    let query = query.split('#').next().unwrap_or(query);
    if query.trim().is_empty() {
        return Ok(OAuthCallbackQuery {
            code: None,
            state: None,
            error: None,
            error_description: None,
        });
    }

    let mut callback = OAuthCallbackQuery {
        code: None,
        state: None,
        error: None,
        error_description: None,
    };

    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (raw_key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        let key = percent_decode(raw_key)?;
        let value = percent_decode(raw_value)?;
        match key.as_str() {
            "code" => callback.code = Some(value),
            "state" => callback.state = Some(value),
            "error" => callback.error = Some(value),
            "error_description" => callback.error_description = Some(value),
            _ => {}
        }
    }

    Ok(callback)
}

pub struct OsEntropy;

#[cfg(target_os = "windows")]
impl OAuthEntropySource for OsEntropy {
    fn fill_bytes(&self, buffer: &mut [u8]) -> Result<(), AuthError> {
        #[link(name = "advapi32")]
        extern "system" {
            fn SystemFunction036(
                random_buffer: *mut std::ffi::c_void,
                random_buffer_length: u32,
            ) -> u8;
        }

        let ok = unsafe { SystemFunction036(buffer.as_mut_ptr().cast(), buffer.len() as u32) };
        if ok == 0 {
            return Err(AuthError::Io(
                "failed to generate secure random bytes from Windows".to_owned(),
            ));
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
impl OAuthEntropySource for OsEntropy {
    fn fill_bytes(&self, buffer: &mut [u8]) -> Result<(), AuthError> {
        let mut file = File::open("/dev/urandom")
            .map_err(|error| AuthError::Io(format!("failed to open /dev/urandom: {error}")))?;
        file.read_exact(buffer)
            .map_err(|error| AuthError::Io(format!("failed to read /dev/urandom: {error}")))
    }
}

fn sanitize_next_path(value: &str) -> String {
    if value.starts_with('/') && !value.starts_with("//") {
        return value.to_owned();
    }
    "/".to_owned()
}

fn url_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        let allowed =
            matches!(byte, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~');
        if allowed {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(percent_hex_digit(byte >> 4));
            encoded.push(percent_hex_digit(byte & 0x0f));
        }
    }
    encoded
}

fn percent_hex_digit(value: u8) -> char {
    match value & 0x0f {
        0..=9 => (b'0' + (value & 0x0f)) as char,
        10..=15 => (b'A' + ((value & 0x0f) - 10)) as char,
        _ => unreachable!(),
    }
}

fn percent_decode(value: &str) -> Result<String, AuthError> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' => {
                if index + 2 >= bytes.len() {
                    return Err(AuthError::InvalidCallback(
                        "callback query contains an invalid percent-encoding",
                    ));
                }
                let high = decode_hex_nibble(bytes[index + 1])?;
                let low = decode_hex_nibble(bytes[index + 2])?;
                output.push((high << 4) | low);
                index += 3;
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(output)
        .map_err(|_| AuthError::InvalidCallback("callback query was not valid utf-8"))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(hex_digit(byte >> 4));
        output.push(hex_digit(byte & 0x0f));
    }
    output
}

fn hex_digit(value: u8) -> char {
    match value & 0x0f {
        0..=9 => (b'0' + (value & 0x0f)) as char,
        10..=15 => (b'a' + ((value & 0x0f) - 10)) as char,
        _ => unreachable!(),
    }
}

fn decode_hex_nibble(value: u8) -> Result<u8, AuthError> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err(AuthError::InvalidCallback(
            "callback query contains an invalid hex digit",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct TestStore {
        pending: Mutex<HashMap<String, PendingOAuthState>>,
    }

    impl OAuthStateStore for TestStore {
        fn save_pending_state(&self, pending: &PendingOAuthState) -> Result<(), AuthError> {
            self.pending
                .lock()
                .map_err(|_| AuthError::Storage("test state store lock poisoned".to_owned()))?
                .insert(pending.state.clone(), pending.clone());
            Ok(())
        }

        fn take_pending_state(&self, state: &str) -> Result<Option<PendingOAuthState>, AuthError> {
            Ok(self
                .pending
                .lock()
                .map_err(|_| AuthError::Storage("test state store lock poisoned".to_owned()))?
                .remove(state))
        }
    }

    struct FixedEntropy([u8; DEFAULT_STATE_BYTES]);

    impl OAuthEntropySource for FixedEntropy {
        fn fill_bytes(&self, buffer: &mut [u8]) -> Result<(), AuthError> {
            buffer.copy_from_slice(&self.0[..buffer.len()]);
            Ok(())
        }
    }

    #[test]
    fn build_workos_authorize_url_matches_backend_shape() {
        let url = build_workos_authorize_url(
            "client_abc",
            "skilly://auth/callback",
            "state_123",
            WorkosAuthMethod::Email,
        )
        .expect("url");

        assert!(url.starts_with("https://api.workos.com/user_management/authorize?"));
        assert!(url.contains("client_id=client_abc"));
        assert!(url.contains("redirect_uri=skilly%3A%2F%2Fauth%2Fcallback"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("provider=authkit"));
        assert!(url.contains("state=state_123"));
    }

    #[test]
    fn parse_oauth_callback_reads_success_and_error_fields() {
        let success = parse_oauth_callback("skilly://auth/callback?code=abc123&state=state_456")
            .expect("success");
        assert_eq!(success.code.as_deref(), Some("abc123"));
        assert_eq!(success.state.as_deref(), Some("state_456"));

        let failure = parse_oauth_callback("error=access_denied&error_description=No+thanks")
            .expect("failure");
        assert_eq!(failure.error.as_deref(), Some("access_denied"));
        assert_eq!(failure.error_description.as_deref(), Some("No thanks"));
    }

    #[test]
    fn oauth_state_validation_prevents_replay() {
        let coordinator = OAuthStateCoordinator::new(
            TestStore::default(),
            FixedEntropy([0x11; DEFAULT_STATE_BYTES]),
        );

        let pending = coordinator
            .begin_authorization("/dashboard", AuthIntent::SignIn, 1_000)
            .expect("pending");

        let validated = coordinator
            .validate_returned_state(&pending.state, 1_500)
            .expect("validated");
        assert_eq!(validated, pending);

        let replay = coordinator.validate_returned_state(&pending.state, 1_501);
        assert!(matches!(replay, Err(AuthError::ReplayDetected)));
    }

    #[test]
    fn oauth_state_expiry_is_enforced() {
        let coordinator = OAuthStateCoordinator::new(
            TestStore::default(),
            FixedEntropy([0x22; DEFAULT_STATE_BYTES]),
        )
        .with_ttl_ms(50);

        let pending = coordinator
            .begin_authorization("/dashboard/billing", AuthIntent::SignUp, 2_000)
            .expect("pending");

        let result = coordinator.validate_returned_state(&pending.state, 2_100);
        assert!(matches!(result, Err(AuthError::ExpiredState)));
    }

    #[test]
    fn auth_flow_state_machine_walks_sign_in_and_refresh() {
        let coordinator = OAuthStateCoordinator::new(
            TestStore::default(),
            FixedEntropy([0x33; DEFAULT_STATE_BYTES]),
        );
        let pending = coordinator
            .begin_authorization("/dashboard", AuthIntent::SignIn, 10)
            .expect("pending");
        let callback = OAuthCallbackQuery {
            code: Some("code_123".to_owned()),
            state: Some(pending.state.clone()),
            error: None,
            error_description: None,
        };

        let exchanging = AuthFlowState::SignedOut
            .authorization_started(pending.clone())
            .callback_received(callback)
            .expect("callback");
        let authenticated = exchanging
            .exchange_succeeded(PersistedAuthSession {
                email: "person@example.com".to_owned(),
                session_token: "session_123".to_owned(),
                expires_at: 500,
                refresh_token: Some("refresh_123".to_owned()),
                user_id: Some("user_123".to_owned()),
            })
            .expect("exchange");

        let refreshed = authenticated
            .refresh_started()
            .expect("refresh start")
            .refresh_succeeded(RefreshSessionResponse {
                session_token: "session_456".to_owned(),
                expires_at: 900,
                refresh_token: None,
            })
            .expect("refresh done");

        match refreshed {
            AuthFlowState::Authenticated(session) => {
                assert_eq!(session.session_token, "session_456");
                assert_eq!(session.refresh_token.as_deref(), Some("refresh_123"));
            }
            other => panic!("expected authenticated session, got {other:?}"),
        }
    }
}
