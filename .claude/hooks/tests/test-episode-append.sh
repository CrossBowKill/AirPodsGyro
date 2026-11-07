#!/bin/bash
# hook-proof: episode-append.sh (episodic ledger writer, command-invoked)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/episode-append.sh"

# Self-contained fixture state: this test owns memory/episodes entirely and
# never depends on shared fixture files (or leaves any behind).
EP_DIR="$CLAUDE_PROJECT_DIR/memory/episodes"
MONTH_FILE="$EP_DIR/$(date +"%Y-%m").jsonl"
INDEX="$EP_DIR/INDEX.md"
rm -rf "$EP_DIR"

# episode-append takes arguments, not stdin; direct-invoke helper.
run_ep() {
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  bash "$HOOK" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

case_name "records: valid episode appended as one JSONL line"
run_ep --task "Fixture episode one" --outcome success --domain fixtures \
       --files "a.md, b.md" --decision "Test the writer" --lesson "Fixtures stay local"
assert_exit 0
assert_file_exists "$MONTH_FILE"
assert_file_contains "$MONTH_FILE" '"task":"Fixture episode one"'
assert_file_contains "$MONTH_FILE" '"outcome":"success"'
assert_file_contains "$MONTH_FILE" '"domain":"fixtures"'
assert_file_contains "$MONTH_FILE" '"lesson":"Fixtures stay local"'
[ "$(wc -l < "$MONTH_FILE" | tr -d ' ')" = "1" ] || fail "expected exactly 1 line in month file"

case_name "valid json: line parses when jq is available"
if command -v jq >/dev/null 2>&1; then
  tail -1 "$MONTH_FILE" | jq -e . >/dev/null 2>&1 || fail "appended line is not valid JSON"
fi

case_name "index: INDEX.md rebuilt with newest entry first"
assert_file_exists "$INDEX"
assert_file_contains "$INDEX" "Episode Index"
assert_file_contains "$INDEX" "success | fixtures | Fixture episode one"

case_name "coerces: unknown outcome degrades to partial, still exit 0"
run_ep --task "Fixture episode two" --outcome bogus --domain fixtures
assert_exit 0
assert_file_contains "$MONTH_FILE" '"task":"Fixture episode two","outcome":"partial"'

case_name "escapes: quotes and backslashes in task survive as one line"
run_ep --task 'Quoted "task" with \backslash' --outcome fail --domain fixtures
assert_exit 0
assert_file_contains "$MONTH_FILE" 'Quoted \"task\" with \\backslash'
if command -v jq >/dev/null 2>&1; then
  tail -1 "$MONTH_FILE" | jq -e . >/dev/null 2>&1 || fail "escaped line is not valid JSON"
fi

case_name "never fails: missing --task records nothing but exits 0"
LINES_BEFORE=$(wc -l < "$MONTH_FILE" | tr -d ' ')
run_ep --outcome success --domain fixtures
assert_exit 0
[ "$(wc -l < "$MONTH_FILE" | tr -d ' ')" = "$LINES_BEFORE" ] || fail "recorded an episode without a task"

case_name "cap: index truncates deterministically at 18 entries / 20 lines"
i=0
while [ "$i" -lt 25 ]; do
  i=$((i + 1))
  bash "$HOOK" --task "Bulk episode $i" --outcome success --domain bulk >/dev/null 2>&1
done
ENTRY_COUNT=$(grep -c '^- \[' "$INDEX")
[ "$ENTRY_COUNT" -le 18 ] || fail "index has $ENTRY_COUNT entries, cap is 18"
TOTAL_LINES=$(wc -l < "$INDEX" | tr -d ' ')
[ "$TOTAL_LINES" -le 20 ] || fail "index has $TOTAL_LINES lines, cap is 20"
assert_file_contains "$INDEX" "Bulk episode 25"
grep -qF "Bulk episode 25" "$INDEX" && head -3 "$INDEX" | grep -qF "Bulk episode 25" || fail "newest entry is not at the top"

case_name "ledger intact: month file kept every append"
FULL_COUNT=$(wc -l < "$MONTH_FILE" | tr -d ' ')
[ "$FULL_COUNT" -ge 28 ] || fail "month file lost lines (got $FULL_COUNT, expected >= 28)"

rm -rf "$EP_DIR"
finish
