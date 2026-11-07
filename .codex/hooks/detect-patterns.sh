#!/bin/bash
# Async helper: detects recurring failure patterns.
# Chained from log-failures.sh after each failure is logged.
# Receives JSON on stdin: {tool, error, category, severity, timestamp}
# Maintains pattern-counts.json and, when a threshold is hit, writes to
# pattern-alerts.md and appends a candidate learning to knowledge-nominations.md
# so recurring failures enter the auditor's knowledge pipeline automatically.
#
# Thresholds: CRITICAL=3, ERROR=5, WARN=10, INFO=20 occurrences.
# Requires jq; degrades gracefully (silent no-op) when jq is absent.
# Fail-open: never blocks, always exits 0.

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat 2>/dev/null)
[ -z "$INPUT" ] && exit 0

TOOL=$(echo "$INPUT" | jq -r '.tool // empty' 2>/dev/null)
ERROR=$(echo "$INPUT" | jq -r '.error // empty' 2>/dev/null)
CATEGORY=$(echo "$INPUT" | jq -r '.category // "OTHER"' 2>/dev/null)
SEVERITY=$(echo "$INPUT" | jq -r '.severity // "WARN"' 2>/dev/null)
TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp // empty' 2>/dev/null)
[ -z "$TIMESTAMP" ] && TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
COUNTS_FILE="$LOG_DIR/pattern-counts.json"
ALERTS_FILE="$LOG_DIR/pattern-alerts.md"
NOMINATIONS_FILE="$CLAUDE_PROJECT_DIR/.claude/knowledge-nominations.md"
DATE_SHORT=$(date +"%m%d%y")

mkdir -p "$LOG_DIR"

if [ -z "$TOOL" ] || [ -z "$ERROR" ]; then
  exit 0
fi

# Fingerprint: normalize the error so repeats of the same failure match.
# Strips timestamps, file paths, line numbers, and hex addresses.
FINGERPRINT=$(echo "${TOOL}_${ERROR}" \
  | sed 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}//g' \
  | sed 's/[0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\}//g' \
  | sed 's|/[^ ]*||g' \
  | sed 's/:[0-9][0-9]*//g' \
  | sed 's/0x[0-9a-fA-F][0-9a-fA-F]*//g' \
  | tr '[:upper:]' '[:lower:]' \
  | tr -cs '[:alnum:]' '_' \
  | head -c 80)
[ -z "$FINGERPRINT" ] && exit 0

# Initialize counts file if missing or empty.
if [ ! -f "$COUNTS_FILE" ] || [ ! -s "$COUNTS_FILE" ]; then
  echo '{}' > "$COUNTS_FILE"
fi

# Initialize alerts file if missing.
if [ ! -f "$ALERTS_FILE" ]; then
  cat > "$ALERTS_FILE" << 'HEADER'
# Pattern Alerts

Recurring failure patterns detected automatically by detect-patterns.sh.
Reviewed by the auditor during /audit, /sync, and /wrap-up.

---

HEADER
fi

# Update count for this fingerprint.
CURRENT=$(jq -r --arg fp "$FINGERPRINT" '.[$fp].count // 0' "$COUNTS_FILE" 2>/dev/null)
[ -z "$CURRENT" ] && CURRENT=0
NEW_COUNT=$((CURRENT + 1))
WAS_FLAGGED=$(jq -r --arg fp "$FINGERPRINT" '.[$fp].flagged // false' "$COUNTS_FILE" 2>/dev/null)

# Atomic write via temp file.
TEMP_FILE=$(mktemp)
jq --arg fp "$FINGERPRINT" \
   --arg ts "$TIMESTAMP" \
   --arg cat "$CATEGORY" \
   --arg sev "$SEVERITY" \
   --argjson count "$NEW_COUNT" \
   --arg tool "$TOOL" \
   --arg err "${ERROR:0:100}" \
   '
   .[$fp] = (
     (.[$fp] // {}) |
     .count = $count |
     .last_seen = $ts |
     .category = $cat |
     .severity = $sev |
     .tool = $tool |
     .sample_error = $err |
     if .first_seen == null then .first_seen = $ts else . end |
     if .flagged == null then .flagged = false else . end
   )
   ' "$COUNTS_FILE" > "$TEMP_FILE" 2>/dev/null && mv "$TEMP_FILE" "$COUNTS_FILE"

# Threshold per severity.
THRESHOLD=10
case "$SEVERITY" in
  CRITICAL) THRESHOLD=3 ;;
  ERROR)    THRESHOLD=5 ;;
  WARN)     THRESHOLD=10 ;;
  INFO)     THRESHOLD=20 ;;
esac

if [ "$NEW_COUNT" -ge "$THRESHOLD" ] && [ "$WAS_FLAGGED" != "true" ]; then
  # Flag the pattern so it nominates exactly once.
  TEMP_FILE2=$(mktemp)
  jq --arg fp "$FINGERPRINT" '.[$fp].flagged = true' "$COUNTS_FILE" > "$TEMP_FILE2" 2>/dev/null && mv "$TEMP_FILE2" "$COUNTS_FILE"

  # Write the alert.
  echo "- \`$TIMESTAMP\` | PATTERN FLAGGED | $CATEGORY/$SEVERITY | $TOOL | ${NEW_COUNT}x occurrences | ${ERROR:0:100}" >> "$ALERTS_FILE"

  # Auto-nominate to the knowledge pipeline (auditor reviews and promotes).
  if [ -f "$NOMINATIONS_FILE" ]; then
    echo "- [$DATE_SHORT] pattern-detector: Recurring failure, $TOOL fails with [$CATEGORY] $SEVERITY error (${NEW_COUNT}x). Sample: ${ERROR:0:100}. Investigate root cause and consider a prevention rule. | Evidence: .claude/logs/pattern-counts.json fingerprint=$FINGERPRINT" >> "$NOMINATIONS_FILE"
  fi
fi

exit 0
