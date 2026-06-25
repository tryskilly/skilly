#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/sdk/web"
OUT_DIR="$REPO_ROOT/sdk/web-cdn-public"
VERSION="${SKILLY_WEB_CDN_VERSION:-v1.0.0}"
VERSION_DIR="$OUT_DIR/web/$VERSION"

echo "Building Skilly web CDN artifact ($VERSION)"

bash "$REPO_ROOT/scripts/build-web-sdk.sh"

cd "$WEB_DIR"
bun install --frozen-lockfile
bun run build

rm -rf "$OUT_DIR"
mkdir -p "$VERSION_DIR"

cp "$WEB_DIR/dist/skilly-web.global.js" "$OUT_DIR/web/v1.js"
cp "$WEB_DIR/dist/skilly-web.global.js.map" "$OUT_DIR/web/v1.js.map"
cp "$WEB_DIR/dist/skilly-web.global.js" "$VERSION_DIR/skilly-web.global.js"
cp "$WEB_DIR/dist/skilly-web.global.js.map" "$VERSION_DIR/skilly-web.global.js.map"
cp "$WEB_DIR/generated/skilly_core_web_sdk.js" "$VERSION_DIR/skilly_core_web_sdk.js"
cp "$WEB_DIR/generated/skilly_core_web_sdk_bg.wasm" "$VERSION_DIR/skilly_core_web_sdk_bg.wasm"

cat > "$OUT_DIR/_headers" <<'HEADERS'
/web/v1.js
  Access-Control-Allow-Origin: *
  Content-Type: application/javascript; charset=utf-8
  Cache-Control: public, max-age=300

/web/v1.0.0/*.js
  Access-Control-Allow-Origin: *
  Content-Type: application/javascript; charset=utf-8
  Cache-Control: public, max-age=31536000, immutable

/web/v1.0.0/*.wasm
  Access-Control-Allow-Origin: *
  Content-Type: application/wasm
  Cache-Control: public, max-age=31536000, immutable

/web/v1.0.0/*.map
  Access-Control-Allow-Origin: *
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=31536000, immutable
HEADERS

cat > "$OUT_DIR/_redirects" <<'REDIRECTS'
/ /web/v1.js 200
REDIRECTS

echo "CDN artifact ready in $OUT_DIR"
find "$OUT_DIR" -maxdepth 3 -type f | sort
