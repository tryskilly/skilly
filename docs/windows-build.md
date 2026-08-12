# Skilly for Windows — build and release

The Windows 11 app is a Tauri 2 host for the complete Skilly teaching loop:
WorkOS sign-in, persistent skills, global hold-to-talk, WASAPI audio, primary-screen
context, OpenAI Realtime voice responses, a native click-through pointing overlay,
conversation history, trial/entitlement enforcement, checkout, telemetry, and updates.

## Developer build

Requirements: Windows 11 22H2+, Visual Studio 2022 Build Tools with Desktop C++,
Rust stable (MSVC), WebView2 Evergreen, and Tauri CLI 2.

```powershell
winget install --id Rustlang.Rustup --exact
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--wait --quiet --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
cargo install tauri-cli --version "^2" --locked
./scripts/build-windows-installer.ps1
```

The script prints the NSIS installer path and SHA-256. Developer builds are
unsigned and the in-app updater explains that it is unavailable.

## Signed release

Run the `Windows Release` GitHub workflow. It creates a draft GitHub Release,
an Authenticode-signed NSIS installer, its Tauri updater signature, and
`latest.json`. Verify the draft on physical Windows hardware before publishing.

Required repository secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded PFX Authenticode certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX password
- `TAURI_SIGNING_PRIVATE_KEY`: Tauri updater private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: updater key password, if configured
- `SKILLY_UPDATER_PUBLIC_KEY`: matching Tauri updater public key
- `SKILLY_POSTHOG_KEY`: optional PostHog project key for remote product analytics

Current release readiness (2026-08-13): the Tauri updater private key, password,
and public key are configured in GitHub Secrets, with recovery copies in the macOS
login Keychain under the `app.tryskilly.skilly.tauri-updater-*` service names.
`WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` remain the only required
external release credentials. Workflow run `31649279800` proves the fail-closed
credential gate stops at `WINDOWS_CERTIFICATE`.

Never rotate or discard the updater private key without a migration plan: every
installed app trusts the embedded matching public key. Local JSONL telemetry is
always written to `%LOCALAPPDATA%\Skilly\skilly-telemetry.jsonl`; remote PostHog
delivery is enabled only in release builds supplied with the project key.

## Release verification

On a clean Windows 11 22H2+ machine, verify install/uninstall, deep-link sign-in,
restart persistence, skill import/activation, push-to-talk, spoken response,
screen-point overlay, checkout/portal, history, tray behavior, and an N-to-N+1
update before making the draft public.
