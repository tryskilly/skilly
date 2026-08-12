use serde_json::{json, Map, Value};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

const POSTHOG_HOST: &str = "https://us.i.posthog.com";

fn telemetry_path() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("APPDATA"))
        .map(PathBuf::from)
        .map(|root| root.join("Skilly").join("skilly-telemetry.jsonl"))
}

pub fn capture(event: &'static str, distinct_id: String, mut properties: Map<String, Value>) {
    properties.insert("platform".to_owned(), json!("windows"));
    properties.insert("app_version".to_owned(), json!(env!("CARGO_PKG_VERSION")));
    let payload = json!({
        "api_key": option_env!("SKILLY_POSTHOG_KEY").unwrap_or(""),
        "event": event,
        "distinct_id": distinct_id,
        "properties": properties,
        "timestamp_ms": crate::current_time_ms(),
    });
    if let Some(path) = telemetry_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{payload}");
        }
    }
    let Some(api_key) = option_env!("SKILLY_POSTHOG_KEY").filter(|key| !key.is_empty()) else {
        return;
    };
    let mut remote_payload = payload;
    remote_payload["api_key"] = json!(api_key);
    std::thread::spawn(move || {
        let _ = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .and_then(|client| {
                client
                    .post(format!("{POSTHOG_HOST}/i/v0/e/"))
                    .json(&remote_payload)
                    .send()
            });
    });
}

pub fn properties(entries: &[(&str, Value)]) -> Map<String, Value> {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_owned(), value.clone()))
        .collect()
}
