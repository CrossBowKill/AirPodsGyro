#!/bin/bash
# hook-proof: community-evidence-extraction/scripts/grounding-check.mjs (synthesis number grounding, read-only)
. "$(dirname "$0")/_assert.sh"
SCRIPT="$HOOKS_DIR/../skills/analyst/community-evidence-extraction/scripts/grounding-check.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "    SKIP node not installed" >&2
  exit 0
fi

run_node() {
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  node "$SCRIPT" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

case_name "ships: the script parses and its self-test passes"
assert_file_exists "$SCRIPT"
node --check "$SCRIPT" 2>/dev/null || fail "node --check failed"
run_node --self-test
assert_exit 0
assert_stdout_contains "PASS"

WORK="$CLAUDE_PROJECT_DIR/grounding"
mkdir -p "$WORK"
cat > "$WORK/cards.json" <<'JSON'
[{"id":"C001","numbers":[{"metric":"MRR","value":"$8k","context":"own result"}]},
 {"id":"C002","numbers":[{"metric":"clients","value":"12","context":"own result"}]}]
JSON
printf -- '- C001 hit $8k MRR with 12 clients.\n- C002 serves 12 clients.\n' > "$WORK/synth.md"

case_name "flags: a number not in the cited card is reported, exit 1"
run_node "$WORK/synth.md" --cards "$WORK/cards.json"
assert_exit 1
assert_stdout_contains "1 not found"
assert_stdout_contains "C001 | 12"

case_name "passes: every quoted number present in its card, exit 0, JSON mode"
printf -- '- C001 hit $8k MRR.\n- C002 serves 12 clients.\n' > "$WORK/synth.md"
run_node "$WORK/synth.md" --cards "$WORK/cards.json" --json
assert_exit 0
assert_stdout_contains '"status": "GROUNDED"'

case_name "usage: no inputs is a usage error, exit 2, never a crash"
run_node "$WORK/synth.md"
assert_exit 2

case_name "read-only: inputs untouched"
assert_file_contains "$WORK/cards.json" '"C002"'

rm -r "$WORK"
finish
