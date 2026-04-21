#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TEMPLATE_PATH="$REPO_ROOT/docs/architecture/runtime-validation-signoff-template.md"
if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "Template not found at $TEMPLATE_PATH" >&2
  exit 1
fi

DATE_UTC="$(date -u +%Y-%m-%d)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

DEFAULT_OUTPUT_PATH="$REPO_ROOT/docs/architecture/runtime-validation-report-${DATE_UTC}.md"
OUTPUT_PATH="${1:-$DEFAULT_OUTPUT_PATH}"

if [[ -f "$OUTPUT_PATH" ]]; then
  echo "Output file already exists: $OUTPUT_PATH" >&2
  echo "Provide a custom path as the first argument to avoid overwriting existing evidence." >&2
  exit 1
fi

{
  printf '# Runtime Validation Report\n\n'
  printf 'Generated (UTC): %s\n' "$DATE_UTC"
  printf 'Branch: `%s`\n' "$BRANCH_NAME"
  printf 'Commit: `%s`\n\n' "$COMMIT_SHA"
  printf 'Source template: `docs/architecture/runtime-validation-signoff-template.md`\n\n'
} > "$OUTPUT_PATH"

cat "$TEMPLATE_PATH" >> "$OUTPUT_PATH"

echo "Created runtime validation report scaffold: $OUTPUT_PATH"
