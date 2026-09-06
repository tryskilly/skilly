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

# Exercise the signing/notarization/stapling/Gatekeeper gate entirely offline.
# Command stubs record ordering and can inject a failure at any stage.
STUB_BIN="${FIXTURE_DIR}/bin"
COMMAND_LOG="${FIXTURE_DIR}/commands.log"
mkdir -p "${STUB_BIN}"
touch "${FIXTURE_DIR}/release.dmg"
cat > "${STUB_BIN}/codesign" <<'EOF'
#!/bin/bash
echo "codesign" >> "${COMMAND_LOG}"
if [[ "${FAIL_STAGE:-}" == "codesign" ]]; then exit 23; fi
EOF
cat > "${STUB_BIN}/xcrun" <<'EOF'
#!/bin/bash
action="${2:-}"
echo "xcrun:${1:-}:${action}" >> "${COMMAND_LOG}"
if [[ "${FAIL_STAGE:-}" == "${action}" ]]; then exit 24; fi
EOF
cat > "${STUB_BIN}/spctl" <<'EOF'
#!/bin/bash
echo "spctl" >> "${COMMAND_LOG}"
if [[ "${FAIL_STAGE:-}" == "spctl" ]]; then exit 25; fi
EOF
chmod +x "${STUB_BIN}/codesign" "${STUB_BIN}/xcrun" "${STUB_BIN}/spctl"

PATH="${STUB_BIN}:${PATH}" COMMAND_LOG="${COMMAND_LOG}" DEVELOPER_IDENTITY="Developer ID Application: Test" \
    SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" dmg-gate "${FIXTURE_DIR}/release.dmg"
expected_order=$'codesign\nxcrun:notarytool:submit\nxcrun:stapler:staple\nxcrun:stapler:validate\nspctl'
[[ "$(<"${COMMAND_LOG}")" == "${expected_order}" ]]

: > "${COMMAND_LOG}"
if PATH="${STUB_BIN}:${PATH}" COMMAND_LOG="${COMMAND_LOG}" FAIL_STAGE=validate DEVELOPER_IDENTITY="Developer ID Application: Test" \
    SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" dmg-gate "${FIXTURE_DIR}/release.dmg"; then
    echo "expected stapler validation failure to abort the release gate" >&2
    exit 1
fi
[[ "$(<"${COMMAND_LOG}")" != *$'spctl'* ]]

# A Gatekeeper failure is also fail-closed and must prevent every publication
# boundary from being reached.
: > "${COMMAND_LOG}"
if PATH="${STUB_BIN}:${PATH}" COMMAND_LOG="${COMMAND_LOG}" FAIL_STAGE=spctl DEVELOPER_IDENTITY="Developer ID Application: Test" \
    SKILLY_RELEASE_TEST_MODE=1 "${RELEASE_SCRIPT}" dmg-gate "${FIXTURE_DIR}/release.dmg"; then
    echo "expected Gatekeeper assessment failure to abort the release gate" >&2
    exit 1
fi

# Keep the production pipeline ordering locked: every signing and publication
# boundary is downstream of the complete DMG gate.
gate_line=$(grep -n '^verify_dmg_gate "${DMG_PATH}"' "${RELEASE_SCRIPT}" | cut -d: -f1)
sparkle_line=$(grep -n 'sign_update' "${RELEASE_SCRIPT}" | tail -1 | cut -d: -f1)
appcast_line=$(grep -n 'generate_appcast' "${RELEASE_SCRIPT}" | tail -1 | cut -d: -f1)
github_line=$(grep -n 'gh release create' "${RELEASE_SCRIPT}" | tail -1 | cut -d: -f1)
publish_line=$(grep -n 'gh api --method PUT' "${RELEASE_SCRIPT}" | tail -1 | cut -d: -f1)
[[ "${gate_line}" -lt "${sparkle_line}" ]]
[[ "${gate_line}" -lt "${appcast_line}" ]]
[[ "${gate_line}" -lt "${github_line}" ]]
[[ "${gate_line}" -lt "${publish_line}" ]]

echo "release helper tests passed"
