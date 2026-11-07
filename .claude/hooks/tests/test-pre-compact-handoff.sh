#!/bin/bash
# hook-proof: pre-compact-handoff.sh (PreCompact substantive auto-handoff writer)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/pre-compact-handoff.sh"
MARKER="$CLAUDE_PROJECT_DIR/.claude/logs/.compaction-occurred"
AUTO_HANDOFF="$CLAUDE_PROJECT_DIR/.claude/logs/.auto-handoff.md"
rm -f "$MARKER" "$AUTO_HANDOFF"

# Self-contained daily-note state (other proofs rewrite the shared fixture note).
DATE_SHORT=$(date +"%m%d%y")
TODAY="$CLAUDE_PROJECT_DIR/Daily Notes/${DATE_SHORT}.md"
[ -f "$TODAY" ] && cp "$TODAY" "$TODAY.precompact-bak"
cat >> "$TODAY" <<'NOTE'

## Session Handoff, 23:59

**Task:** Prove the pre-compact auto-handoff captures this exact section
**Files:** .claude/memory.md
**Next:** Read the auto-handoff and confirm this section surfaced
NOTE

case_name "fires: marker written and compaction logged"
run_hook '{"trigger":"auto"}'
assert_exit 0
assert_file_exists "$MARKER"
assert_file_contains "$CLAUDE_PROJECT_DIR/.claude/logs/incident-log.md" "COMPACTION"

case_name "substantive: auto-handoff carries memory Now section"
assert_file_exists "$AUTO_HANDOFF"
assert_file_contains "$AUTO_HANDOFF" "Auto-Handoff"
assert_file_contains "$AUTO_HANDOFF" "Fixture task in flight"

case_name "substantive: auto-handoff surfaces the daily-note Session Handoff"
assert_file_contains "$AUTO_HANDOFF" "Session Handoff"
assert_file_contains "$AUTO_HANDOFF" "Prove the pre-compact auto-handoff captures this exact section"

case_name "trigger recorded: manual compaction tagged in the handoff"
rm -f "$MARKER" "$AUTO_HANDOFF"
run_hook '{"trigger":"manual"}'
assert_exit 0
assert_file_contains "$AUTO_HANDOFF" "manual"

case_name "never breaks: empty stdin still writes marker and handoff"
rm -f "$MARKER" "$AUTO_HANDOFF"
run_hook ''
assert_exit 0
assert_file_exists "$MARKER"
assert_file_exists "$AUTO_HANDOFF"
rm -f "$MARKER" "$AUTO_HANDOFF"

# Restore the shared fixture daily note.
if [ -f "$TODAY.precompact-bak" ]; then
  mv "$TODAY.precompact-bak" "$TODAY"
fi

finish
