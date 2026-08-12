[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDirectory = Join-Path $repoRoot "apps/windows-shell-gui"
$tauriConfig = Join-Path $appDirectory "tauri.conf.json"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust is required. Install Rustup, open a new terminal, and retry."
}

if (-not (Test-Path $tauriConfig)) {
    throw "Tauri configuration was not found at $tauriConfig."
}

$tauriCommand = Get-Command cargo-tauri -ErrorAction SilentlyContinue
if (-not $tauriCommand) {
    throw "Tauri CLI is required. Install it with: cargo install tauri-cli --version ^2 --locked"
}

Push-Location $appDirectory
try {
    cargo tauri build --bundles nsis
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri installer build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

$bundleDirectory = Join-Path $appDirectory "target/release/bundle/nsis"
$installer = Get-ChildItem -Path $bundleDirectory -Filter "*-setup.exe" |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "Tauri completed without producing an NSIS installer in $bundleDirectory."
}

$installerHash = Get-FileHash -Path $installer.FullName -Algorithm SHA256
Write-Host "Windows installer: $($installer.FullName)"
Write-Host "SHA256: $($installerHash.Hash)"
