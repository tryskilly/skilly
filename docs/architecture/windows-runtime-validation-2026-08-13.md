# Windows runtime validation — 2026-08-13

Validated commit: `8567503d06c72c4f74b50a0ed39e2bbe02ce4201`

## Environment

- Physical Windows 11 host, build 26100
- Interactive desktop session with AutoCAD Plant 3D running
- Rust 1.97.1 MSVC toolchain
- Current-user NSIS installation under `%LOCALAPPDATA%\Skilly`

## Evidence

- `cargo check --release --locked` passed natively on Windows.
- `cargo build --release --locked` passed natively on Windows.
- GitHub Windows GUI run `31646749240` built and uploaded the NSIS installer.
- The installed production host launched without an updater key.
- The production panel rendered account, readiness, history, settings, and push-to-talk state.
- Primary-screen capture initialized against the live AutoCAD desktop.
- The native click-through overlay initialized and the panel reported 100% readiness.
- The Skilly process remained responsive in the interactive Windows session.
- AutoCAD remained running and was not modified by installation or validation.

## Automated verification

- `cargo test --manifest-path apps/windows-shell-gui/Cargo.toml --locked`: 58 passed.
- Rust core and shell checks passed on Ubuntu, Windows, and macOS CI.
- macOS release guard and mobile SDK consumer checks passed.

## Distribution boundary

The developer installer is intentionally unsigned. The Tauri updater signing identity
was generated after runtime validation and is backed up in both GitHub repository
secrets and the macOS login Keychain. The plaintext temporary key files were removed.

Signed-release workflow run `31649279800` verified that the workflow now reaches the
credential gate and stops specifically at `WINDOWS_CERTIFICATE`. Public release
therefore remains fail-closed only until a publicly trusted Authenticode PFX and its
password are configured as documented in `docs/windows-build.md`.

## Interactive account boundary

The validation desktop was signed out of Skilly. WorkOS sign-in and a live paid/trial
Realtime turn require an interactive user account; the host itself reported every
Windows platform capability ready.
