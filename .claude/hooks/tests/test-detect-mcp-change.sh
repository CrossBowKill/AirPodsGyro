#!/bin/bash
# hook-proof: detect-mcp-change.sh (PostToolUse Write|Edit on .mcp.json)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/detect-mcp-change.sh"
LOGS="$CLAUDE_PROJECT_DIR/.claude/logs"
MARKER="$LOGS/.mcp-changed"

rm -f "$MARKER"

case_name "fires: edit to .mcp.json writes marker, logs, and tells Claude"
run_hook "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$CLAUDE_PROJECT_DIR/.mcp.json\"}}"
assert_exit 0
assert_stdout_contains "MCP config changed"
assert_file_exists "$MARKER"
assert_file_contains "$LOGS/incident-log.md" ".mcp.json changed"

case_name "ignores: edit to any other file is silent"
rm -f "$MARKER"
run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$CLAUDE_PROJECT_DIR/README.md\"}}"
assert_exit 0
assert_stdout_empty
assert_file_missing "$MARKER"

case_name "never breaks: malformed stdin"
run_hook 'garbage'
assert_exit 0
assert_stdout_empty

case_name "never breaks: empty stdin"
run_hook ''
assert_exit 0

finish
