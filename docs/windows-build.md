# Windows developer build

The Windows GUI is a Tauri 2 developer preview. Its NSIS installer pipeline is
available, but the current application still uses placeholder platform adapters
and must not be promoted as the public Windows product.

## Build prerequisites

- Windows 11 22H2 or newer
- Microsoft Edge WebView2 Runtime
- Microsoft Visual Studio 2022 Build Tools with the Desktop development with C++ workload
- Rust stable using the MSVC target
- Tauri CLI 2

Install the command-line tools from an elevated PowerShell terminal:

```powershell
winget install --id Rustlang.Rustup --exact
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--wait --quiet --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
cargo install tauri-cli --version "^2" --locked
```

Open a new terminal after installation, then build the current-user NSIS installer:

```powershell
./scripts/build-windows-installer.ps1
```

The script prints the installer path and SHA-256 digest. The installer remains
unsigned until a Triskilly Windows code-signing identity is configured.

## Public-release gates

- Replace every `StubPlatformAdapters` dependency in the GUI host with real Windows implementations.
- Validate sign-in, entitlement, global push-to-talk, screen capture, audio, realtime response, and overlay pointing on physical Windows 11 hardware.
- Configure a Triskilly code-signing certificate or managed signing service.
- Add signed updater artifacts and verify an N to N+1 upgrade.
- Complete clean-machine installer and uninstall tests before adding a Windows download CTA.
