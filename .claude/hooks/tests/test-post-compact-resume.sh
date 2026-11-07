#!/bin/bash
# hook-proof: post-compact-resume.sh (SessionStart(compact), the resume Claude reads)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/post-compact-resume.sh"
LOGS="$CLAUDE_PROJECT_DIR/.claude/logs"
MARKER="$LOGS/.compaction-occurred"
NOTES="$CLAUDE_PROJECT_DIR/Daily Notes"
TODAY="$NOTES/$(date +"%m%d%y").md"

case_name "fires: marker present, resume instructions injected, marker consumed"
echo "2026-07-24 10:00:00" > "$MARKER"
run_hook ''
assert_exit 0
assert_stdout_contains "POST-COMPACTION RESUME"
assert_file_missing "$MARKER"

case_name "resumes from the handoff: Next action and instructions in the output"
cp "$TODAY" "$TODAY.keep"
printf '
## Session Handoff, 11:00

**Next:** Finish the fixture job
' >> "$TODAY"
echo "2026-07-24 10:00:00" > "$MARKER"
run_hook '{"hook_event_name":"SessionStart","source":"compact"}'
assert_exit 0
assert_stdout_contains "Session Handoff"
assert_stdout_contains "Finish the fixture job"
assert_stdout_contains "Carry on with the Next action"
assert_stdout_contains "asks for something else"
mv "$TODAY.keep" "$TODAY"

case_name "either event order: PostCompact first still leaves a resume"
echo "2026-07-24 10:00:00" > "$MARKER"
bash "$HOOKS_DIR/post-compact.sh" < /dev/null > /dev/null 2>&1
run_hook '{"hook_event_name":"SessionStart","source":"compact"}'
assert_exit 0
assert_stdout_contains "POST-COMPACTION RESUME"

case_name "past midnight: falls back to the most recent note with a handoff"
mv "$TODAY" "$TODAY.keep"
printf '# Daily Note\n\n## Session Handoff, 23:50\n\n**Next:** Finish the late job\n\n## End of Day Summary\n\nnot part of the handoff\n' > "$NOTES/010125.md"
echo "2026-07-24 10:00:00" > "$MARKER"
run_hook ''
assert_exit 0
assert_stdout_contains "Finish the late job"
grep -qF "not part of the handoff" "$STDOUT_FILE" && fail "later section leaked into the handoff"
rm -f "$NOTES/010125.md"
mv "$TODAY.keep" "$TODAY"

case_name "no handoff anywhere: still resumes from the summary"
mv "$TODAY" "$TODAY.keep"
echo "2026-07-24 10:00:00" > "$MARKER"
run_hook ''
assert_exit 0
assert_stdout_contains "pick up the task the summary shows in progress"
mv "$TODAY.keep" "$TODAY"

case_name "stays under the 10,000-character hook limit with a huge handoff"
cp "$TODAY" "$TODAY.keep"
awk 'BEGIN { print "## Session Handoff, 10:00"; for (i = 0; i < 400; i++) print "- a long line of handoff text that keeps going and going for the size test" }' >> "$TODAY"
awk 'BEGIN { for (i = 0; i < 400; i++) print "a long line of auto handoff text that keeps going and going for the size test" }' > "$LOGS/.auto-handoff.md"
echo "2026-07-24 10:00:00" > "$MARKER"
run_hook ''
assert_exit 0
SIZE=$(wc -c < "$STDOUT_FILE" | tr -d ' ')
[ "$SIZE" -lt 10000 ] || fail "output is $SIZE characters, over the limit"
mv "$TODAY.keep" "$TODAY"
rm -f "$LOGS/.auto-handoff.md"

case_name "fires-clean: no marker, silent no-op"
run_hook ''
assert_exit 0
assert_stdout_empty

case_name "never breaks: malformed stdin"
run_hook 'garbage'
assert_exit 0

finish
