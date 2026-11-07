#!/bin/bash
# PostToolUseFailure hook, categorizes and logs tool failures.
# Categories: BUILD, API, FILESYSTEM, NETWORK, PERMISSION, OTHER
# Severities: CRITICAL, ERROR, WARN, INFO
# Chains to detect-patterns.sh so recurring failures are counted and, at
# threshold, auto-nominated to the knowledge pipeline.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
ERROR=$(echo "$INPUT" | jq -r '[.error?, .tool_error?, (.tool_response? | objects | (.error? // .stderr? // .message?)), (.tool_response? | strings), (.tool_result? | strings)] | map(select(. != null and . != "")) | first // empty' 2>/dev/null | head -5)
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
FAILURE_LOG="$LOG_DIR/failure-log.md"
INCIDENT_LOG="$LOG_DIR/incident-log.md"

mkdir -p "$LOG_DIR"

# Categorize the failure
CATEGORY="OTHER"
SEVERITY="ERROR"

case "$ERROR" in
  *"ENOENT"*|*"No such file"*|*"not found"*)
    CATEGORY="FILESYSTEM"
    SEVERITY="WARN"
    ;;
  *"EACCES"*|*"Permission denied"*|*"EPERM"*)
    CATEGORY="PERMISSION"
    SEVERITY="ERROR"
    ;;
  *"ECONNREFUSED"*|*"ETIMEDOUT"*|*"fetch failed"*|*"network"*)
    CATEGORY="NETWORK"
    SEVERITY="ERROR"
    ;;
  *"401"*|*"403"*|*"429"*|*"500"*|*"API"*|*"rate limit"*)
    CATEGORY="API"
    SEVERITY="ERROR"
    ;;
  *"build"*|*"compile"*|*"syntax"*|*"TypeError"*|*"ReferenceError"*)
    CATEGORY="BUILD"
    SEVERITY="ERROR"
    ;;
  *"CRITICAL"*|*"fatal"*|*"panic"*)
    SEVERITY="CRITICAL"
    ;;
esac

# Truncate error for log readability
SHORT_ERROR=$(echo "$ERROR" | head -1 | cut -c1-200)

if [ -z "$TOOL" ] && [ -z "$SHORT_ERROR" ]; then
  echo "log-failures.sh: empty payload (no tool_name, no error), row skipped" >&2
  exit 0
fi

# Write to failure log
echo "- \`$TIMESTAMP\` | $SEVERITY | $CATEGORY | $TOOL | $SHORT_ERROR" >> "$FAILURE_LOG"

# Also write to incident log if ERROR or CRITICAL
if [ "$SEVERITY" = "ERROR" ] || [ "$SEVERITY" = "CRITICAL" ]; then
  echo "- \`$TIMESTAMP\` | FAILURE | $SEVERITY | $CATEGORY | $TOOL | $SHORT_ERROR" >> "$INCIDENT_LOG"
fi

# Chain to pattern detection (async, non-blocking). Skips silently when the
# script or jq is absent, so this hook never fails because of the chain.
PATTERN_SCRIPT="$CLAUDE_PROJECT_DIR/.claude/hooks/detect-patterns.sh"
if [ -x "$PATTERN_SCRIPT" ] && [ -n "$TOOL" ] && command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg tool "$TOOL" \
    --arg err "$SHORT_ERROR" \
    --arg cat "$CATEGORY" \
    --arg sev "$SEVERITY" \
    --arg ts "$TIMESTAMP" \
    '{tool: $tool, error: $err, category: $cat, severity: $sev, timestamp: $ts}' \
    | "$PATTERN_SCRIPT" &
fi

exit 0
