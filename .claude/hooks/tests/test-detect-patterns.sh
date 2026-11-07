#!/bin/bash
# hook-proof: detect-patterns.sh (recurring-failure fingerprinting + auto-nomination)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/detect-patterns.sh"
LOGS="$CLAUDE_PROJECT_DIR/.claude/logs"
COUNTS="$LOGS/pattern-counts.json"
ALERTS="$LOGS/pattern-alerts.md"
NOMS="$CLAUDE_PROJECT_DIR/.claude/knowledge-nominations.md"
rm -f "$COUNTS" "$ALERTS"
cp "$NOMS" "$NOMS.bak"

PAYLOAD='{"tool":"Bash","error":"Exit code 1 fixture deploy blew up","category":"BUILD","severity":"CRITICAL","timestamp":"2026-01-01 00:00:00"}'

case_name "counts: first occurrence recorded, no nomination yet"
run_hook "$PAYLOAD"
assert_exit 0
assert_file_exists "$COUNTS"
if grep -qF "pattern-detector" "$NOMS"; then fail "nominated below threshold"; fi

case_name "fires: CRITICAL threshold (3x) trips alert + nomination"
run_hook "$PAYLOAD"
run_hook "$PAYLOAD"
assert_exit 0
assert_file_exists "$ALERTS"
assert_file_contains "$ALERTS" "PATTERN FLAGGED"
assert_file_contains "$NOMS" "pattern-detector"
assert_file_contains "$NOMS" "BUILD"

case_name "flags once: a 4th occurrence does not duplicate the nomination"
run_hook "$PAYLOAD"
assert_exit 0
NOM_COUNT=$(grep -cF "pattern-detector" "$NOMS")
[ "$NOM_COUNT" -eq 1 ] || fail "expected exactly 1 nomination, got $NOM_COUNT"

case_name "degrades: silent no-op when jq is absent"
STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
printf '%s' "$PAYLOAD" | PATH="" /bin/bash "$HOOK" > "$STDOUT_FILE" 2> "$STDERR_FILE"
EXIT_CODE=$?
assert_exit 0
assert_stdout_empty

case_name "never breaks: empty stdin"
run_hook ''
assert_exit 0

mv "$NOMS.bak" "$NOMS"
rm -f "$COUNTS" "$ALERTS"
finish
