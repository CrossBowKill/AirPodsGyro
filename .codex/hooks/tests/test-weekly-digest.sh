#!/bin/bash
# hook-proof: weekly-digest.sh (manual script, aggregates Session Handoffs)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/weekly-digest.sh"
DIGEST_DIR="$CLAUDE_PROJECT_DIR/memory/weekly-digests"
TODAY_FILE="$DIGEST_DIR/$(date +"%Y-%m-%d").md"

run_script() {
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  bash "$HOOK" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

case_name "fires: today's fixture handoff lands in the digest"
rm -rf "$DIGEST_DIR"
run_script
assert_exit 0
assert_stdout_contains "weekly-digest: written to"
assert_file_exists "$TODAY_FILE"
assert_file_contains "$TODAY_FILE" "Prove every shipped hook fires and blocks as documented"
assert_file_contains "$TODAY_FILE" "## Decisions this week"
assert_file_contains "$TODAY_FILE" "Test against a fixture, never the real project"

case_name "dry run: prints the digest, writes nothing"
rm -rf "$DIGEST_DIR"
run_script --dry-run
assert_exit 0
assert_stdout_contains "dry run"
assert_stdout_contains "## Sessions"
assert_file_missing "$TODAY_FILE"

case_name "never breaks: no Daily Notes directory"
EMPTY=$(mktemp -d)
STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
CLAUDE_PROJECT_DIR="$EMPTY" bash "$HOOK" > "$STDOUT_FILE" 2> "$STDERR_FILE"
EXIT_CODE=$?
assert_exit 0
assert_stdout_contains "nothing to digest"
rm -rf "$EMPTY"

finish
