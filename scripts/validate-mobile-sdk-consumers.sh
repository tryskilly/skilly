#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUILD_DIR="$REPO_ROOT/build/mobile-sdk-validation"
KOTLIN_VERSION="2.0.21"
KOTLIN_DISTRIBUTION_URL="https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip"
JNA_VERSION="5.17.0"
JNA_JAR_PATH="$BUILD_DIR/jna-${JNA_VERSION}.jar"
KOTLIN_MAIN_PATH="$BUILD_DIR/SkillyMobileSdkValidationMain.kt"
KOTLIN_OUTPUT_JAR="$BUILD_DIR/skilly-mobile-sdk-validation.jar"
SWIFT_MAIN_PATH="$BUILD_DIR/SkillyMobileSdkValidationMain.swift"
SWIFT_BINARY_PATH="$BUILD_DIR/skilly-mobile-sdk-validation"
KOTLIN_COMPILER_ROOT="$BUILD_DIR/kotlin-compiler"

mkdir -p "$BUILD_DIR"

./scripts/generate-mobile-sdk-bindings.sh

cargo build -p skilly-core-mobile-sdk

if [[ ! -f "$JNA_JAR_PATH" ]]; then
  curl -L -o "$JNA_JAR_PATH" "https://repo1.maven.org/maven2/net/java/dev/jna/jna/${JNA_VERSION}/jna-${JNA_VERSION}.jar"
fi

KOTLIN_COMPILER_BIN="$(command -v kotlinc || true)"
if [[ -z "$KOTLIN_COMPILER_BIN" ]]; then
  KOTLIN_COMPILER_BIN="$KOTLIN_COMPILER_ROOT/kotlinc/bin/kotlinc"
  if [[ ! -x "$KOTLIN_COMPILER_BIN" ]]; then
    KOTLIN_ZIP_PATH="$BUILD_DIR/kotlin-compiler-${KOTLIN_VERSION}.zip"
    if [[ ! -f "$KOTLIN_ZIP_PATH" ]]; then
      curl -L -o "$KOTLIN_ZIP_PATH" "$KOTLIN_DISTRIBUTION_URL"
    fi

    rm -rf "$KOTLIN_COMPILER_ROOT"
    mkdir -p "$KOTLIN_COMPILER_ROOT"
    unzip -q "$KOTLIN_ZIP_PATH" -d "$KOTLIN_COMPILER_ROOT"
  fi
fi

cat > "$KOTLIN_MAIN_PATH" <<'KOTLIN'
import app.tryskilly.sdk.PolicyAndRealtimeExample

fun main() {
    PolicyAndRealtimeExample.runDemo()
}
KOTLIN

"$KOTLIN_COMPILER_BIN" \
  sdk/android/generated/uniffi/skilly_core_mobile_sdk/skilly_core_mobile_sdk.kt \
  sdk/android/sample/src/main/kotlin/app/tryskilly/sdk/PolicyAndRealtimeExample.kt \
  "$KOTLIN_MAIN_PATH" \
  -cp "$JNA_JAR_PATH" \
  -include-runtime \
  -d "$KOTLIN_OUTPUT_JAR"

java \
  -Djna.library.path="$REPO_ROOT/target/debug" \
  -Djava.library.path="$REPO_ROOT/target/debug" \
  -cp "$KOTLIN_OUTPUT_JAR:$JNA_JAR_PATH" \
  SkillyMobileSdkValidationMainKt

if [[ "$(uname -s)" == "Darwin" ]]; then
  cat > "$SWIFT_MAIN_PATH" <<'SWIFT'
import Foundation

@main
struct Main {
  static func main() {
    runPolicyAndRealtimeDemo()
  }
}
SWIFT

  swiftc \
    sdk/ios/generated/skilly_core_mobile_sdk.swift \
    sdk/ios/sample/PolicyAndRealtimeExample.swift \
    "$SWIFT_MAIN_PATH" \
    -I sdk/ios/generated \
    -Xcc -fmodule-map-file="$REPO_ROOT/sdk/ios/generated/skilly_core_mobile_sdkFFI.modulemap" \
    -L "$REPO_ROOT/target/debug" \
    -lskilly_core_mobile_sdk \
    -o "$SWIFT_BINARY_PATH"

  DYLD_LIBRARY_PATH="$REPO_ROOT/target/debug" "$SWIFT_BINARY_PATH"
else
  echo "Skipping Swift mobile SDK consumer runtime validation on non-macOS host."
fi

echo "Mobile SDK consumer validation completed successfully."
