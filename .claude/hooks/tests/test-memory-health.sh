#!/bin/bash
# hook-proof: .claude/scripts/memory-health.py (read-only memory health report, command-invoked by /memory-reconcile)
. "$(dirname "$0")/_assert.sh"
SCRIPT="$HOOKS_DIR/../scripts/memory-health.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "    SKIP python3 not installed" >&2
  exit 0
fi

# run_py <args...>: runs the script against the fixture project, captures exit + stdout + stderr.
run_py() {
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  python3 -I "$SCRIPT" --root "$CLAUDE_PROJECT_DIR" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

MEM="$CLAUDE_PROJECT_DIR/.claude/memory.md"
cp "$MEM" "$MEM.bak"

case_name "self-test: the script's built-in proof passes"
STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
python3 -I "$SCRIPT" --self-test > "$STDOUT_FILE" 2> "$STDERR_FILE"; EXIT_CODE=$?
assert_exit 0
assert_stdout_contains "PASS"

case_name "flags: stale, undated and relative-time items in watched sections"
cat > "$MEM" <<'EOF'
# Memory

## Now
- [010120] ancient dated task still listed
- task with no date at all
- [2020-01-01] finish this TODAY

## Open Threads
- (none yet)

## Recent Decisions
- [010120] old decision in an unwatched section
EOF
run_py --stale-days 14
assert_exit 2
assert_stdout_contains '"status": "ATTENTION"'
assert_stdout_contains "stale dated items"
assert_stdout_contains "undated items"
assert_stdout_contains "relative time words"
grep -qF "old decision in an unwatched section" "$STDOUT_FILE" && fail "unwatched section was scanned"

case_name "spares: a clean, dated memory reports OK with exit 0"
TODAY_STAMP=$(date +"%m%d%y")
cat > "$MEM" <<EOF
# Memory

## Now
- [$TODAY_STAMP] current task, freshly stamped

## Open Threads
- (none yet)
EOF
run_py --stale-days 14
assert_exit 0
assert_stdout_contains '"status": "OK"'

case_name "read-only: the script changed nothing on disk"
assert_file_contains "$MEM" "current task, freshly stamped"
assert_file_missing "$CLAUDE_PROJECT_DIR/.claude/memory-archive"

case_name "never breaks: missing memory.md degrades to a flag, valid JSON, exit 2"
rm -f "$MEM"
run_py
assert_exit 2
assert_stdout_contains "memory.md missing"

mv "$MEM.bak" "$MEM"
finish
