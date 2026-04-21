# Scripts

## `release.sh` — Ship a new version of Skilly

Automates the full macOS app release pipeline: build -> sign -> DMG -> notarize -> Sparkle appcast -> GitHub Release.

### Quick start

```bash
# Auto-bumps version and build number from the latest GitHub Release
./scripts/release.sh
```

### Override version or build

```bash
# Set a specific marketing version (auto-bumps build)
./scripts/release.sh 2.0

# Set both marketing version and build number
./scripts/release.sh 2.0 10
```

## `generate-mobile-sdk-bindings.sh` — Regenerate Swift/Kotlin SDK bindings

Builds `skilly-core-mobile-sdk` and regenerates UniFFI bindings:

- `sdk/ios/generated/`
- `sdk/android/generated/`

```bash
./scripts/generate-mobile-sdk-bindings.sh
```

## `validate-mobile-sdk-consumers.sh` — Runtime-check mobile SDK consumers

Runs end-to-end consumer validation against generated bindings:

1. Regenerates bindings.
2. Builds mobile SDK Rust library.
3. Compiles and runs Kotlin/JVM sample against generated Kotlin bindings.
4. On macOS, compiles and runs Swift sample against generated Swift bindings.

```bash
./scripts/validate-mobile-sdk-consumers.sh
```

## `package-mobile-sdk.sh` — Create distributable SDK artifact

Packages generated bindings, samples, and the host release dynamic library into `dist/mobile-sdk/`.

```bash
./scripts/package-mobile-sdk.sh
```

Output example:

- `dist/mobile-sdk/skilly-mobile-sdk-v0.1.0-darwin.tar.gz`
- `dist/mobile-sdk/skilly-mobile-sdk-v0.1.0-darwin.tar.gz.sha256`

## `package-rust-ffi-dylib.sh` — Create distributable core FFI artifact

Builds `skilly-core-ffi --release` and packages the release library into `dist/rust-ffi/`.

```bash
./scripts/package-rust-ffi-dylib.sh
```

Output example:

- `dist/rust-ffi/skilly-core-ffi-v0.1.0-darwin.tar.gz`
- `dist/rust-ffi/skilly-core-ffi-v0.1.0-darwin.tar.gz.sha256`

## `create-runtime-validation-report.sh` — Scaffold strict sign-off report

Generates a dated manual-runtime validation report scaffold in `docs/architecture/` using the strict template:

```bash
./scripts/create-runtime-validation-report.sh
```

Custom output path:

```bash
./scripts/create-runtime-validation-report.sh docs/architecture/runtime-validation-report-custom.md
```
