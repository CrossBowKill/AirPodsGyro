#!/bin/bash
# SessionStart hook, source "compact": the resume step after any compaction.
# This is the channel that reaches Claude. Claude Code adds SessionStart stdout
# to the conversation; PostCompact stdout only goes to the debug log.
#
# Works in either event order, because post-compact.sh leaves the marker alone.
# Output stays under the 10,000-character hook limit, so it is always read in
# full. Fail-open: never blocks, always exits 0.

set +e

LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
NOTES_DIR="$CLAUDE_PROJECT_DIR/Daily Notes"
MARKER="$LOG_DIR/.compaction-occurred"
AUTO_HANDOFF="$LOG_DIR/.auto-handoff.md"

# Drain stdin (SessionStart payload) so the pipe never blocks; content unused.
cat > /dev/null 2>&1

# Only run if compaction actually occurred
if [ ! -f "$MARKER" ]; then
  exit 0
fi

# Reset session counters
rm -f "$LOG_DIR/.tool-call-count" "$LOG_DIR/.quality-gate-active" 2>/dev/null

# Read compaction timestamp
COMPACT_TIME=$(cat "$MARKER" 2>/dev/null || echo "unknown")

# Clean up marker
rm -f "$MARKER"

# Keep a block to a character budget, whole lines first.
cap() {
  awk -v max="$1" '{ n += length($0) + 1; if (n > max) { print substr($0, 1, max - (n - length($0) - 1)); print "[cut here to fit, read the file for the rest]"; exit } print }'
}

# The latest Session Handoff section in a note, up to the next heading.
last_handoff() {
  awk '/^## Session Handoff/{ f = 1; out = $0 "\n"; next } /^## /{ f = 0 } f { out = out $0 "\n" } END { printf "%s", out }' "$1" 2>/dev/null
}

# Today's note first, then the most recent note that has a handoff, so a
# session running past midnight still finds yesterday's.
NOTE_NAME=""
HANDOFF=""
TODAY_NOTE="$NOTES_DIR/$(date +"%m%d%y" 2>/dev/null).md"
if [ -f "$TODAY_NOTE" ]; then
  HANDOFF=$(last_handoff "$TODAY_NOTE")
  [ -n "$HANDOFF" ] && NOTE_NAME=$(basename "$TODAY_NOTE")
fi
if [ -z "$HANDOFF" ] && [ -d "$NOTES_DIR" ]; then
  NEWEST=$(ls -t "$NOTES_DIR"/*.md 2>/dev/null | head -3 | while IFS= read -r NOTE; do
    if grep -q '^## Session Handoff' "$NOTE" 2>/dev/null; then
      printf '%s\n' "$NOTE"
      break
    fi
  done)
  if [ -n "$NEWEST" ]; then
    HANDOFF=$(last_handoff "$NEWEST")
    NOTE_NAME=$(basename "$NEWEST")
  fi
fi

echo "POST-COMPACTION RESUME (compacted at $COMPACT_TIME)"
echo ""
echo "Claude Code has just replaced the earlier messages in this conversation with a summary. The summary keeps the user's requests and the key code, but detail that only lived in the conversation may be gone. Files on disk are unchanged, so trust them over anything you half remember."

if [ -n "$HANDOFF" ]; then
  echo ""
  echo "--- Latest Session Handoff (Daily Notes/$NOTE_NAME) ---"
  printf '%s\n' "$HANDOFF" | cap 4000
  echo "---"
fi

# The mechanical safety net from pre-compact-handoff.sh. Its copy of the handoff
# is dropped here, because the block above already shows it.
if [ -f "$AUTO_HANDOFF" ]; then
  echo ""
  echo "--- Auto-captured state ---"
  awk '/^## Latest agent-authored Session Handoff/{ exit } { print }' "$AUTO_HANDOFF" 2>/dev/null | cap 3500
  echo "---"
fi

echo ""
echo "What to do now:"
echo "1. Read .claude/memory.md if it exists, then re-read the files the Next action depends on."
echo "2. Carry on with the Next action without asking the user what to do. Never ask them to run /compact or /safe-clear."
echo "3. If the user's latest message asks for something else, do that instead."
echo "4. If there is no handoff, or Next is empty, pick up the task the summary shows in progress. If the summary shows work finished after this handoff was written, start from the summary."
echo "5. If a detail you need is missing, say which one and ask for that one detail. Never guess at it."

exit 0
