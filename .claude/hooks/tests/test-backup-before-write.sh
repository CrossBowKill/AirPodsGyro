#!/bin/bash
# hook-proof: backup-before-write.sh (PreToolUse Write|Edit)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/backup-before-write.sh"

case_name "fires: backup created for existing file"
run_hook "{\"tool_input\":{\"file_path\":\"$CLAUDE_PROJECT_DIR/fixture.txt\"}}"
assert_exit 0
BK=$(ls "$CLAUDE_PROJECT_DIR/.claude/backups/$(date +%Y-%m-%d)/"fixture.txt.*.bak 2>/dev/null | head -1)
[ -n "$BK" ] || fail "no backup file created"

case_name "two files with the same name in different folders stay apart"
mkdir -p "$CLAUDE_PROJECT_DIR/alpha" "$CLAUDE_PROJECT_DIR/beta"
echo one > "$CLAUDE_PROJECT_DIR/alpha/same.md"
echo two > "$CLAUDE_PROJECT_DIR/beta/same.md"
run_hook "{\"tool_input\":{\"file_path\":\"$CLAUDE_PROJECT_DIR/alpha/same.md\"}}"
run_hook "{\"tool_input\":{\"file_path\":\"$CLAUDE_PROJECT_DIR/beta/same.md\"}}"
assert_exit 0
DAY_DIR="$CLAUDE_PROJECT_DIR/.claude/backups/$(date +%Y-%m-%d)"
ls "$DAY_DIR"/alpha_same.md.*.bak > /dev/null 2>&1 || fail "no backup for alpha/same.md"
ls "$DAY_DIR"/beta_same.md.*.bak > /dev/null 2>&1 || fail "no backup for beta/same.md"

case_name "notebook edits are backed up too"
echo '{}' > "$CLAUDE_PROJECT_DIR/book.ipynb"
run_hook "{\"tool_name\":\"NotebookEdit\",\"tool_input\":{\"notebook_path\":\"$CLAUDE_PROJECT_DIR/book.ipynb\"}}"
assert_exit 0
ls "$DAY_DIR"/book.ipynb.*.bak > /dev/null 2>&1 || fail "no backup for the notebook"

case_name "fires-clean: missing file skipped"
run_hook '{"tool_input":{"file_path":"/nonexistent/nope.txt"}}'
assert_exit 0

case_name "never breaks: malformed stdin"
run_hook 'garbage'
assert_exit 0

finish
