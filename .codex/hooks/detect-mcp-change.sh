#!/bin/bash
# PostToolUse(Write|Edit|NotebookEdit) hook: detects an edit to .mcp.json.
# MCP servers connect at session start, so a server added or changed mid-session
# is invisible until the next session. This hook writes a marker to
# .claude/logs/.mcp-changed, logs the event, and tells Claude to say so, instead
# of letting the session silently call tools that do not exist yet.
# Fail-open: ignores every other file, tolerates malformed stdin, always exits 0.

INPUT=$(cat 2>/dev/null)
[ -z "$INPUT" ] && exit 0

FILE_PATH=""
if command -v jq >/dev/null 2>&1; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
elif . "$(dirname "$0")/lib/python.sh" 2>/dev/null && claudify_python; then
  FILE_PATH=$(HOOK_INPUT="$INPUT" $CLAUDIFY_PY - 2>/dev/null <<'PY'
import json, os
try:
    d = json.loads(os.environ.get("HOOK_INPUT", "")).get("tool_input", {})
    print(d.get("file_path") or d.get("notebook_path") or "")
except Exception:
    print("")
PY
)
else
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')
fi

case "$FILE_PATH" in
  *.mcp.json) ;;
  *) exit 0 ;;
esac

LOG_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/logs"
mkdir -p "$LOG_DIR" 2>/dev/null
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
echo "$TIMESTAMP" > "$LOG_DIR/.mcp-changed" 2>/dev/null
echo "- \`$TIMESTAMP\` | SESSION | INFO | .mcp.json changed, new MCP servers connect on next session start" >> "$LOG_DIR/incident-log.md" 2>/dev/null

# Emit structured hook output so the notice reaches Claude as additionalContext and the
# user as a systemMessage (plain stdout from an exit-0 PostToolUse hook is transcript-only).
MSG="MCP config changed: .mcp.json was edited. New or changed MCP servers connect at session start, so their tools are not available in this session. Finish the current step, then start a new session for the new servers to load (run /safe-clear first if there is state worth keeping). Do not call tools from the new server until then."
printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$MSG" "$MSG"

exit 0
