#!/bin/bash
# PreCompact hook: fires before BOTH auto and manual compaction.
# It never blocks compaction and does not change the summary Claude Code writes.
# Its job is to guarantee that a substantive handoff is on disk so the
# post-compaction session resumes sharp WITHOUT any user action.
#
# Design (the "always-warm handoff"):
#   - The agent keeps the daily note's latest "## Session Handoff" warm during
#     long work (operating rule in CLAUDE.md). That is the intelligent,
#     agent-authored handoff.
#   - This hook writes a substantive MECHANICAL fallback to .auto-handoff.md
#     every time compaction fires, so even an un-prepped session resumes with
#     real state, not just a marker.
#   - post-compact-resume.sh (SessionStart, source "compact") shows Claude the
#     freshest of these.
# Fail-open: never blocks, always exits 0.

LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
MARKER="$LOG_DIR/.compaction-occurred"
AUTO_HANDOFF="$LOG_DIR/.auto-handoff.md"
AUDIT_TRAIL="$LOG_DIR/audit-trail.md"
MEMORY="$CLAUDE_PROJECT_DIR/.claude/memory.md"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
DATE_SHORT=$(date +"%m%d%y")
DAILY_NOTE="$CLAUDE_PROJECT_DIR/Daily Notes/${DATE_SHORT}.md"

# Compaction trigger (auto|manual) arrives on stdin JSON; capture if present.
INPUT=$(cat 2>/dev/null || echo '{}')
TRIGGER=$(echo "$INPUT" | grep -o '"trigger"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -z "$TRIGGER" ] && TRIGGER="auto"

mkdir -p "$LOG_DIR"

# Marker: post-compact-resume.sh reads this to know a compaction happened, and
# removes it.
echo "$TIMESTAMP" > "$MARKER"

# Build the mechanical fallback handoff.
{
  echo "# Auto-Handoff (mechanical fallback), $TIMESTAMP"
  echo ""
  echo "Compaction trigger: $TRIGGER. Written automatically by pre-compact-handoff.sh."
  echo "If a fresher \"## Session Handoff\" exists in today's daily note, prefer that"
  echo "(it is agent-authored and richer). Use this file to fill any gaps."
  echo ""
  echo "## Memory: current priorities (memory.md -> Now)"
  if [ -f "$MEMORY" ]; then
    awk '/^## Now/{f=1;next} /^## /{if(f)exit} f' "$MEMORY" 2>/dev/null | head -25
  else
    echo "(memory.md not found)"
  fi
  echo ""
  echo "## Files touched this session (most recent last)"
  if [ -f "$AUDIT_TRAIL" ]; then
    tail -25 "$AUDIT_TRAIL" 2>/dev/null
  else
    find "$CLAUDE_PROJECT_DIR" -type f -newermt '-120 minutes' \
      -not -path '*/.git/*' -not -path '*/node_modules/*' \
      -not -path '*/.claude/logs/*' -not -path '*/.claude/backups/*' \
      2>/dev/null | head -20
  fi
  echo ""
  echo "## Latest agent-authored Session Handoff (from today's daily note)"
  if [ -f "$DAILY_NOTE" ]; then
    awk '/^## Session Handoff/{found=1; out=""; out=out $0 "\n"; next} found{out=out $0 "\n"} END{printf "%s", out}' "$DAILY_NOTE" 2>/dev/null | head -60
    echo ""
    echo "(Source: Daily Notes/${DATE_SHORT}.md. Read it directly for the full handoff.)"
  else
    echo "(No daily note for today. The resumed session should reconstruct state from"
    echo " memory.md plus the files list above, then continue the most recent task.)"
  fi
} > "$AUTO_HANDOFF" 2>/dev/null

# Log the event.
echo "- \`$TIMESTAMP\` | COMPACTION | INFO | ${TRIGGER}-compact triggered, auto-handoff written" >> "$LOG_DIR/incident-log.md"

exit 0
