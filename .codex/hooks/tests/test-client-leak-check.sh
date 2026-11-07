#!/bin/bash
# hook-proof: .claude/scripts/client-leak-check.py (cross-client mention scan over clients/<slug>/, read-only)
. "$(dirname "$0")/_assert.sh"
SCRIPT="$HOOKS_DIR/../scripts/client-leak-check.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "    SKIP python3 not installed" >&2
  exit 0
fi

run_py() {
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  python3 -I "$SCRIPT" --root "$CLAUDE_PROJECT_DIR" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

case_name "self-test: the script's built-in proof passes"
STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
python3 -I "$SCRIPT" --self-test > "$STDOUT_FILE" 2> "$STDERR_FILE"; EXIT_CODE=$?
assert_exit 0
assert_stdout_contains "PASS"

case_name "no clients folder: reports NO_CLIENTS_FOLDER, exit 2"
[ -d "$CLAUDE_PROJECT_DIR/clients" ] && rm -r "$CLAUDE_PROJECT_DIR/clients"
run_py
assert_exit 2
assert_stdout_contains "NO_CLIENTS_FOLDER"

C="$CLAUDE_PROJECT_DIR/clients"
mkdir -p "$C/_TEMPLATE" "$C/alpine" "$C/harbor"
printf '# Client: {name} ({slug})\n' > "$C/_TEMPLATE/CLAUDE.md"
printf '# Client: Alpine Outfitters (alpine)\n\n## Leak-check terms\n- Alpine Outfitters\n- ACC-7781\n' > "$C/alpine/CLAUDE.md"
printf '# Client: Harbor Coffee (harbor)\n\n## Leak-check terms\n- Harbor Coffee\n' > "$C/harbor/CLAUDE.md"
printf -- '- 2026-10-03: weekly report format adopted (own notes)\n' > "$C/alpine/history.md"
printf -- '- 2026-10-04: reused the Alpine Outfitters deck for account ACC-7781\n' > "$C/harbor/history.md"

case_name "flags: a mention of another client inside a space is a LEAK, exit 1, with file and line"
run_py
assert_exit 1
assert_stdout_contains '"status": "LEAK"'
assert_stdout_contains '"file": "clients/harbor/history.md"'
assert_stdout_contains '"mentions_client": "alpine"'
grep -qF '"space": "alpine"' "$STDOUT_FILE" && fail "the clean space was flagged"

case_name "allow-list: a listed file is skipped"
printf 'clients/harbor/history.md\n' > "$C/leak-allow.txt"
run_py
assert_exit 0
assert_stdout_contains '"status": "CLEAN"'
rm "$C/leak-allow.txt"

case_name "clean: slots instead of names pass, exit 0"
printf -- '- 2026-10-04: reused the {other_client} deck\n' > "$C/harbor/history.md"
run_py
assert_exit 0
assert_stdout_contains '"status": "CLEAN"'

case_name "read-only: nothing moved or rewritten"
assert_file_contains "$C/alpine/history.md" "weekly report format"

rm -r "$C"
finish
