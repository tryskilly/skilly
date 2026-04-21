#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MOBILE_SDK_CRATE_PATH="$REPO_ROOT/core/mobile-sdk/Cargo.toml"
MOBILE_SDK_VERSION="$(sed -n 's/^version = "\([0-9.]*\)"/\1/p' "$MOBILE_SDK_CRATE_PATH" | head -1)"
if [[ -z "$MOBILE_SDK_VERSION" ]]; then
  echo "Could not determine mobile SDK version from $MOBILE_SDK_CRATE_PATH" >&2
  exit 1
fi

RELEASE_LIBRARY_DIR="$REPO_ROOT/target/release"
DIST_ROOT="$REPO_ROOT/dist/mobile-sdk"
DIST_VERSION_DIR="$DIST_ROOT/v${MOBILE_SDK_VERSION}"
DIST_PLATFORM_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
DIST_OUTPUT_FILE="$DIST_ROOT/skilly-mobile-sdk-v${MOBILE_SDK_VERSION}-${DIST_PLATFORM_NAME}.tar.gz"

rm -rf "$DIST_VERSION_DIR"
mkdir -p \
  "$DIST_VERSION_DIR/ios/generated" \
  "$DIST_VERSION_DIR/ios/sample" \
  "$DIST_VERSION_DIR/android/generated" \
  "$DIST_VERSION_DIR/android/sample" \
  "$DIST_VERSION_DIR/native"

./scripts/generate-mobile-sdk-bindings.sh
cargo build -p skilly-core-mobile-sdk --release

case "$(uname -s)" in
  Darwin)
    RELEASE_LIBRARY_PATH="$RELEASE_LIBRARY_DIR/libskilly_core_mobile_sdk.dylib"
    ;;
  Linux)
    RELEASE_LIBRARY_PATH="$RELEASE_LIBRARY_DIR/libskilly_core_mobile_sdk.so"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    RELEASE_LIBRARY_PATH="$RELEASE_LIBRARY_DIR/skilly_core_mobile_sdk.dll"
    ;;
  *)
    echo "Unsupported host OS for packaging." >&2
    exit 1
    ;;
esac

if [[ ! -f "$RELEASE_LIBRARY_PATH" ]]; then
  echo "Expected release library at $RELEASE_LIBRARY_PATH" >&2
  exit 1
fi

cp -R sdk/ios/generated/. "$DIST_VERSION_DIR/ios/generated/"
cp -R sdk/ios/sample/. "$DIST_VERSION_DIR/ios/sample/"
cp -R sdk/android/generated/. "$DIST_VERSION_DIR/android/generated/"
cp -R sdk/android/sample/. "$DIST_VERSION_DIR/android/sample/"
cp "$RELEASE_LIBRARY_PATH" "$DIST_VERSION_DIR/native/"
cp sdk/README.md "$DIST_VERSION_DIR/README.md"

cat > "$DIST_VERSION_DIR/MANIFEST.txt" <<MANIFEST
skilly-core-mobile-sdk version: ${MOBILE_SDK_VERSION}
packaged-on-host: ${DIST_PLATFORM_NAME}
release-library: $(basename "$RELEASE_LIBRARY_PATH")
MANIFEST

mkdir -p "$DIST_ROOT"
rm -f "$DIST_OUTPUT_FILE"
tar -czf "$DIST_OUTPUT_FILE" -C "$DIST_ROOT" "v${MOBILE_SDK_VERSION}"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$DIST_OUTPUT_FILE" > "${DIST_OUTPUT_FILE}.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$DIST_OUTPUT_FILE" > "${DIST_OUTPUT_FILE}.sha256"
fi

echo "Packaged mobile SDK artifact: $DIST_OUTPUT_FILE"
if [[ -f "${DIST_OUTPUT_FILE}.sha256" ]]; then
  echo "Checksum file: ${DIST_OUTPUT_FILE}.sha256"
fi
