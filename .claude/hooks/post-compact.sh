#!/bin/bash
# PostCompact hook: resets session counters and gate files after compaction, and
# writes the resume details to the debug log (claude --debug). Claude does not
# read PostCompact stdout. The resume Claude reads is post-compact-resume.sh, on
# SessionStart with source "compact". That hook needs .compaction-occurred, so
# this hook leaves the marker alone, whichever of the two runs first.
#
# Fail-open: never blocks, never errors a session. Always exit 0.

set +e

LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
mkdir -p "$LOG_DIR" 2>/dev/null

# Drain stdin (PostCompact payload) so the pipe never blocks; content unused.
cat > /dev/null 2>&1

# Reset session counters and gate files (fresh context, fresh signals).
rm -f "$LOG_DIR/.tool-call-count" \
      "$LOG_DIR/.quality-gate-active" \
      "$LOG_DIR/.session-quality-state" \
      "$LOG_DIR/.session-files-read" 2>/dev/null

echo "POST-COMPACTION RESUME: Context was compacted. Session state was preserved on disk. Do NOT ask the user what to do; resume."

# Surface the latest agent-authored Session Handoff from today's daily note.
DATE_SHORT=$(date +"%m%d%y" 2>/dev/null)
DAILY_NOTE="$CLAUDE_PROJECT_DIR/Daily Notes/${DATE_SHORT}.md"
if [ -f "$DAILY_NOTE" ]; then
  HANDOFF=$(awk '/^## Session Handoff/{found=1; out=""; out=out $0 "\n"; next} found{out=out $0 "\n"} END{printf "%s", out}' "$DAILY_NOTE" 2>/dev/null | head -60)
  if [ -n "$HANDOFF" ]; then
    echo ""
    echo "--- Latest Session Handoff (Daily Notes/${DATE_SHORT}.md) ---"
    echo "$HANDOFF"
    echo "-------------------------------------------------------------"
  fi
fi

# Surface the mechanical auto-handoff written by pre-compact-handoff.sh.
# It is the safety net for sessions that never wrote an agent-authored handoff;
# when both exist, the agent-authored one above is preferred and this fills gaps.
AUTO_HANDOFF="$LOG_DIR/.auto-handoff.md"
if [ -f "$AUTO_HANDOFF" ]; then
  echo ""
  echo "--- Auto-captured state (pre-compact safety net) ---"
  head -80 "$AUTO_HANDOFF" 2>/dev/null
  echo "----------------------------------------------------"
fi

# Enrich with related past handoffs when the helper ships alongside this hook.
RELATED_HELPER="$CLAUDE_PROJECT_DIR/.claude/hooks/inject-related-context.sh"
if [ -x "$RELATED_HELPER" ]; then
  "$RELATED_HELPER" 2>/dev/null
fi

echo ""
echo "Then: read .claude/memory.md plus the handoff above, restore state from the file paths it lists, and execute the Next action."

exit 0
