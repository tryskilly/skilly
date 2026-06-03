#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LIB_NAME="skilly_core_mobile_sdk"
BUILD_PROFILE="debug"
IOS_OUTPUT_DIR="$REPO_ROOT/sdk/ios/generated"
ANDROID_OUTPUT_DIR="$REPO_ROOT/sdk/android/generated"

cargo build -p skilly-core-mobile-sdk

case "$(uname -s)" in
  Darwin)
    LIB_PATH="$REPO_ROOT/target/$BUILD_PROFILE/lib${LIB_NAME}.dylib"
    ;;
  Linux)
    LIB_PATH="$REPO_ROOT/target/$BUILD_PROFILE/lib${LIB_NAME}.so"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    LIB_PATH="$REPO_ROOT/target/$BUILD_PROFILE/${LIB_NAME}.dll"
    ;;
  *)
    echo "Unsupported host OS for binding generation." >&2
    exit 1
    ;;
esac

if [[ ! -f "$LIB_PATH" ]]; then
  echo "Expected compiled library at $LIB_PATH" >&2
  exit 1
fi

mkdir -p "$IOS_OUTPUT_DIR" "$ANDROID_OUTPUT_DIR"

cargo run -p skilly-core-mobile-sdk --bin uniffi-bindgen -- \
  generate \
  --library "$LIB_PATH" \
  --language swift \
  --out-dir "$IOS_OUTPUT_DIR"

cargo run -p skilly-core-mobile-sdk --bin uniffi-bindgen -- \
  generate \
  --library "$LIB_PATH" \
  --language kotlin \
  --out-dir "$ANDROID_OUTPUT_DIR"

echo "Generated Swift bindings in $IOS_OUTPUT_DIR"
echo "Generated Kotlin bindings in $ANDROID_OUTPUT_DIR"
