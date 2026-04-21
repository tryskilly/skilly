#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FFI_CRATE_MANIFEST="$REPO_ROOT/core/ffi/Cargo.toml"
FFI_VERSION="$(sed -n 's/^version = "\([0-9.]*\)"/\1/p' "$FFI_CRATE_MANIFEST" | head -1)"
if [[ -z "$FFI_VERSION" ]]; then
  echo "Could not determine FFI crate version from $FFI_CRATE_MANIFEST" >&2
  exit 1
fi

DIST_ROOT="$REPO_ROOT/dist/rust-ffi"
DIST_VERSION_DIR="$DIST_ROOT/v${FFI_VERSION}"
DIST_PLATFORM_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
DIST_OUTPUT_FILE="$DIST_ROOT/skilly-core-ffi-v${FFI_VERSION}-${DIST_PLATFORM_NAME}.tar.gz"
RELEASE_LIBRARY_DIR="$REPO_ROOT/target/release"

cargo build -p skilly-core-ffi --release

case "$(uname -s)" in
  Darwin)
    FFI_LIBRARY_PATH="$RELEASE_LIBRARY_DIR/libskilly_core_ffi.dylib"
    ;;
  Linux)
    FFI_LIBRARY_PATH="$RELEASE_LIBRARY_DIR/libskilly_core_ffi.so"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    FFI_LIBRARY_PATH="$RELEASE_LIBRARY_DIR/skilly_core_ffi.dll"
    ;;
  *)
    echo "Unsupported host OS for Rust FFI packaging." >&2
    exit 1
    ;;
esac

if [[ ! -f "$FFI_LIBRARY_PATH" ]]; then
  echo "Expected release FFI library at $FFI_LIBRARY_PATH" >&2
  exit 1
fi

rm -rf "$DIST_VERSION_DIR"
mkdir -p "$DIST_VERSION_DIR"

cp "$FFI_LIBRARY_PATH" "$DIST_VERSION_DIR/"
cat > "$DIST_VERSION_DIR/MANIFEST.txt" <<MANIFEST
skilly-core-ffi version: ${FFI_VERSION}
packaged-on-host: ${DIST_PLATFORM_NAME}
release-library: $(basename "$FFI_LIBRARY_PATH")
MANIFEST

mkdir -p "$DIST_ROOT"
rm -f "$DIST_OUTPUT_FILE"
tar -czf "$DIST_OUTPUT_FILE" -C "$DIST_ROOT" "v${FFI_VERSION}"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$DIST_OUTPUT_FILE" > "${DIST_OUTPUT_FILE}.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$DIST_OUTPUT_FILE" > "${DIST_OUTPUT_FILE}.sha256"
fi

echo "Packaged Rust FFI artifact: $DIST_OUTPUT_FILE"
if [[ -f "${DIST_OUTPUT_FILE}.sha256" ]]; then
  echo "Checksum file: ${DIST_OUTPUT_FILE}.sha256"
fi
