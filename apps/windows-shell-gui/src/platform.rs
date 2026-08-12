use serde::Serialize;
use skilly_windows_shell::{AdapterCapabilityStatus, PlatformCapabilitySnapshot};

pub const WINDOWS_MINIMUM_BUILD: u32 = 22_621;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessStatus {
    Ready,
    Attention,
    Blocked,
}

impl ReadinessStatus {
    fn severity(self) -> u8 {
        match self {
            ReadinessStatus::Ready => 0,
            ReadinessStatus::Attention => 1,
            ReadinessStatus::Blocked => 2,
        }
    }

    fn max(self, other: Self) -> Self {
        if self.severity() >= other.severity() {
            self
        } else {
            other
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReadinessCheck {
    pub id: String,
    pub title: String,
    pub status: ReadinessStatus,
    pub detail: String,
    pub action_label: Option<String>,
    pub action_command: Option<String>,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PlatformReadiness {
    pub overall_status: ReadinessStatus,
    pub summary: String,
    pub score_percent: u8,
    pub floor_label: String,
    pub blockers: Vec<String>,
    pub checks: Vec<ReadinessCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WindowsRuntimeFacts {
    pub build_number: Option<u32>,
    pub webview2_runtime: Option<bool>,
}

impl WindowsRuntimeFacts {
    pub fn preview() -> Self {
        Self {
            build_number: Some(WINDOWS_MINIMUM_BUILD),
            webview2_runtime: Some(true),
        }
    }
}

#[cfg(target_os = "windows")]
pub fn windows_build_number() -> Option<u32> {
    #[repr(C)]
    struct OsVersionInfo {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform_id: u32,
        service_pack: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(version: *mut OsVersionInfo) -> i32;
    }
    let mut version = OsVersionInfo {
        size: std::mem::size_of::<OsVersionInfo>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform_id: 0,
        service_pack: [0; 128],
    };
    (unsafe { RtlGetVersion(&mut version) } >= 0).then_some(version.build)
}

#[cfg(not(target_os = "windows"))]
pub fn windows_build_number() -> Option<u32> {
    None
}

pub fn build_platform_readiness(
    snapshot: &PlatformCapabilitySnapshot,
    facts: &WindowsRuntimeFacts,
) -> PlatformReadiness {
    let mut checks = vec![
        map_os_floor(facts.build_number),
        map_webview2(facts.webview2_runtime),
    ];
    checks.extend([
        map_adapter(
            "capture",
            "Screen capture",
            &snapshot.capture,
            true,
            "Primary-monitor capture is ready.",
            "Open Windows graphics settings",
            "open_capture_settings",
        ),
        map_adapter(
            "hotkey",
            "Push-to-talk hotkey",
            &snapshot.hotkey,
            true,
            "Global hold-to-talk is ready.",
            "Open shortcut settings",
            "open_shortcut_settings",
        ),
        map_adapter(
            "overlay",
            "Cursor overlay",
            &snapshot.overlay,
            true,
            "The teaching cursor can draw above your apps.",
            "Review overlay permissions",
            "open_overlay_settings",
        ),
        map_adapter(
            "permissions",
            "System permissions",
            &snapshot.permissions,
            true,
            "Required Windows permissions are available.",
            "Open permissions help",
            "open_permissions_settings",
        ),
        map_adapter(
            "audio_input",
            "Microphone",
            &snapshot.audio_input,
            false,
            "Microphone capture is ready.",
            "Open sound input settings",
            "open_audio_input_settings",
        ),
        map_adapter(
            "audio_output",
            "Speaker playback",
            &snapshot.audio_output,
            false,
            "Speech playback is ready.",
            "Open sound output settings",
            "open_audio_output_settings",
        ),
    ]);

    let score_units: u32 = checks
        .iter()
        .map(|check| match check.status {
            ReadinessStatus::Ready => 100,
            ReadinessStatus::Attention => 55,
            ReadinessStatus::Blocked => 0,
        })
        .sum();
    let score_percent = (score_units / checks.len() as u32) as u8;

    let overall_status = checks.iter().fold(ReadinessStatus::Ready, |status, check| {
        status.max(check.status)
    });

    let blockers = checks
        .iter()
        .filter(|check| check.status == ReadinessStatus::Blocked)
        .map(|check| format!("{}: {}", check.title, check.detail))
        .collect::<Vec<_>>();

    let summary = match overall_status {
        ReadinessStatus::Ready => {
            "Windows host is ready for the full Skilly teaching loop.".to_string()
        }
        ReadinessStatus::Attention => {
            "Skilly can run, but one or more surfaces still need polish or fallback handling."
                .to_string()
        }
        ReadinessStatus::Blocked => {
            "Skilly is blocked by at least one missing Windows requirement.".to_string()
        }
    };

    PlatformReadiness {
        overall_status,
        summary,
        score_percent,
        floor_label: format!("Windows 11 22H2+ · build {}", WINDOWS_MINIMUM_BUILD),
        blockers,
        checks,
    }
}

fn map_os_floor(build_number: Option<u32>) -> ReadinessCheck {
    match build_number {
        Some(build) if build >= WINDOWS_MINIMUM_BUILD => ReadinessCheck {
            id: "os_floor".to_string(),
            title: "OS support".to_string(),
            status: ReadinessStatus::Ready,
            detail: format!("Build {build} meets the Windows 11 22H2 floor."),
            action_label: None,
            action_command: None,
            required: true,
        },
        Some(build) => ReadinessCheck {
            id: "os_floor".to_string(),
            title: "OS support".to_string(),
            status: ReadinessStatus::Blocked,
            detail: format!(
                "Build {build} is below the supported minimum build {}.",
                WINDOWS_MINIMUM_BUILD
            ),
            action_label: Some("Upgrade Windows".to_string()),
            action_command: Some("open_windows_update".to_string()),
            required: true,
        },
        None => ReadinessCheck {
            id: "os_floor".to_string(),
            title: "OS support".to_string(),
            status: ReadinessStatus::Attention,
            detail: "Windows build is not yet reported by the host.".to_string(),
            action_label: Some("Retry system scan".to_string()),
            action_command: Some("refresh_platform_facts".to_string()),
            required: true,
        },
    }
}

fn map_webview2(installed: Option<bool>) -> ReadinessCheck {
    match installed {
        Some(true) => ReadinessCheck {
            id: "webview2".to_string(),
            title: "WebView2 runtime".to_string(),
            status: ReadinessStatus::Ready,
            detail: "The panel renderer is available.".to_string(),
            action_label: None,
            action_command: None,
            required: true,
        },
        Some(false) => ReadinessCheck {
            id: "webview2".to_string(),
            title: "WebView2 runtime".to_string(),
            status: ReadinessStatus::Blocked,
            detail: "The Microsoft Edge WebView2 runtime is missing.".to_string(),
            action_label: Some("Install WebView2".to_string()),
            action_command: Some("install_webview2".to_string()),
            required: true,
        },
        None => ReadinessCheck {
            id: "webview2".to_string(),
            title: "WebView2 runtime".to_string(),
            status: ReadinessStatus::Attention,
            detail: "WebView2 availability has not been confirmed yet.".to_string(),
            action_label: Some("Retry runtime check".to_string()),
            action_command: Some("refresh_platform_facts".to_string()),
            required: true,
        },
    }
}

fn map_adapter(
    id: &str,
    title: &str,
    adapter_status: &AdapterCapabilityStatus,
    required: bool,
    ready_detail: &str,
    action_label: &str,
    action_command: &str,
) -> ReadinessCheck {
    match adapter_status {
        AdapterCapabilityStatus::Available => ReadinessCheck {
            id: id.to_string(),
            title: title.to_string(),
            status: ReadinessStatus::Ready,
            detail: ready_detail.to_string(),
            action_label: None,
            action_command: None,
            required,
        },
        AdapterCapabilityStatus::Degraded { reason } => ReadinessCheck {
            id: id.to_string(),
            title: title.to_string(),
            status: ReadinessStatus::Attention,
            detail: reason.clone(),
            action_label: Some(action_label.to_string()),
            action_command: Some(action_command.to_string()),
            required,
        },
        AdapterCapabilityStatus::Unavailable { reason } => ReadinessCheck {
            id: id.to_string(),
            title: title.to_string(),
            status: if required {
                ReadinessStatus::Blocked
            } else {
                ReadinessStatus::Attention
            },
            detail: reason.clone(),
            action_label: Some(action_label.to_string()),
            action_command: Some(action_command.to_string()),
            required,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_platform_readiness, ReadinessStatus, WindowsRuntimeFacts, WINDOWS_MINIMUM_BUILD,
    };
    use skilly_windows_shell::{AdapterCapabilityStatus, PlatformCapabilitySnapshot};

    fn ready_snapshot() -> PlatformCapabilitySnapshot {
        PlatformCapabilitySnapshot {
            capture: AdapterCapabilityStatus::Available,
            hotkey: AdapterCapabilityStatus::Available,
            overlay: AdapterCapabilityStatus::Available,
            audio_input: AdapterCapabilityStatus::Available,
            audio_output: AdapterCapabilityStatus::Available,
            permissions: AdapterCapabilityStatus::Available,
        }
    }

    #[test]
    fn minimum_supported_build_is_ready() {
        let readiness = build_platform_readiness(
            &ready_snapshot(),
            &WindowsRuntimeFacts {
                build_number: Some(WINDOWS_MINIMUM_BUILD),
                webview2_runtime: Some(true),
            },
        );

        assert_eq!(readiness.overall_status, ReadinessStatus::Ready);
        assert_eq!(readiness.score_percent, 100);
        assert!(readiness.blockers.is_empty());
    }

    #[test]
    fn unsupported_build_blocks_readiness() {
        let readiness = build_platform_readiness(
            &ready_snapshot(),
            &WindowsRuntimeFacts {
                build_number: Some(22_000),
                webview2_runtime: Some(true),
            },
        );

        assert_eq!(readiness.overall_status, ReadinessStatus::Blocked);
        assert!(readiness
            .blockers
            .iter()
            .any(|blocker| blocker.contains("OS support")));
    }

    #[test]
    fn degraded_hotkey_only_needs_attention() {
        let mut snapshot = ready_snapshot();
        snapshot.hotkey = AdapterCapabilityStatus::Degraded {
            reason: "RAW_INPUT fallback required".to_string(),
        };

        let readiness = build_platform_readiness(
            &snapshot,
            &WindowsRuntimeFacts {
                build_number: Some(WINDOWS_MINIMUM_BUILD),
                webview2_runtime: Some(true),
            },
        );

        assert_eq!(readiness.overall_status, ReadinessStatus::Attention);
        assert!(readiness.blockers.is_empty());
        assert!(readiness.score_percent < 100);
    }

    #[test]
    fn missing_optional_audio_output_does_not_block() {
        let mut snapshot = ready_snapshot();
        snapshot.audio_output = AdapterCapabilityStatus::Unavailable {
            reason: "no output device".to_string(),
        };

        let readiness = build_platform_readiness(
            &snapshot,
            &WindowsRuntimeFacts {
                build_number: Some(WINDOWS_MINIMUM_BUILD),
                webview2_runtime: Some(true),
            },
        );

        assert_eq!(readiness.overall_status, ReadinessStatus::Attention);
        assert!(readiness.blockers.is_empty());
    }
}
