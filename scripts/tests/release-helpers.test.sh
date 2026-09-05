#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_SCRIPT="${SCRIPT_DIR}/release.sh"
FIXTURE_DIR="$(mktemp -d /private/tmp/skilly-release-helpers.XXXXXX)"
trap 'rm -rf "${FIXTURE_DIR}"' EXIT

APPCAST_FIXTURE="${FIXTURE_DIR}/appcast.xml"
PROJECT_FIXTURE="${FIXTURE_DIR}/project.pbxproj"
cat > "${APPCAST_FIXTURE}" <<'EOF'
<sparkle:version>26</sparkle:version>
<sparkle:version>15</sparkle:version>
EOF
cat > "${PROJECT_FIXTURE}" <<'EOF'
CURRENT_PROJECT_VERSION = 1;
CURRENT_PROJECT_VERSION = 24;
EOF

floor=$(SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" floor "${APPCAST_FIXTURE}" "${PROJECT_FIXTURE}")
[[ "${floor}" == "26" ]]

next_floor=$(SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" floor "${FIXTURE_DIR}/missing.xml" "${PROJECT_FIXTURE}")
[[ "${next_floor}" == "24" ]]

cat > "${PROJECT_FIXTURE}" <<'EOF'
CURRENT_PROJECT_VERSION = 30;
EOF
project_ahead_floor=$(SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" floor "${APPCAST_FIXTURE}" "${PROJECT_FIXTURE}")
[[ "${project_ahead_floor}" == "30" ]]

SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" validate-build 27 26
if SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" validate-build 26 26; then
    echo "expected equal build number to be rejected" >&2
    exit 1
fi
if SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" validate-build 0 0; then
    echo "expected zero build number to be rejected" >&2
    exit 1
fi

SPARKLE_FIXTURE="${FIXTURE_DIR}/sparkle/bin"
mkdir -p "${SPARKLE_FIXTURE}"
touch "${SPARKLE_FIXTURE}/generate_appcast" "${SPARKLE_FIXTURE}/sign_update"
chmod +x "${SPARKLE_FIXTURE}/generate_appcast" "${SPARKLE_FIXTURE}/sign_update"
SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" validate-sparkle "${SPARKLE_FIXTURE}"
if SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" validate-sparkle "${FIXTURE_DIR}/missing-bin"; then
    echo "expected missing Sparkle tools to be rejected" >&2
    exit 1
fi

echo "release helper tests passed"
