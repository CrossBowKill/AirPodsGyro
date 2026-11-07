#!/bin/bash
# hook-proof: log-failures.sh (PostToolUseFailure logger + detect-patterns chain)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/log-failures.sh"

case_name "fires: permission failure categorized and logged"
run_hook '{"tool_name":"Bash","error":"EACCES: Permission denied"}'
assert_exit 0
assert_file_contains "$CLAUDE_PROJECT_DIR/.claude/logs/failure-log.md" "PERMISSION"

case_name "fires: network failure categorized"
run_hook '{"tool_name":"WebFetch","error":"ECONNREFUSED connect"}'
assert_exit 0
assert_file_contains "$CLAUDE_PROJECT_DIR/.claude/logs/failure-log.md" "NETWORK"

case_name "chains: repeated failures reach detect-patterns and trip a nomination"
# Ship the chain target into the fixture (log-failures resolves it under
# CLAUDE_PROJECT_DIR, exactly as in an installed project).
cp "$HOOKS_DIR/detect-patterns.sh" "$CLAUDE_PROJECT_DIR/.claude/hooks/detect-patterns.sh"
chmod +x "$CLAUDE_PROJECT_DIR/.claude/hooks/detect-patterns.sh"
NOMS="$CLAUDE_PROJECT_DIR/.claude/knowledge-nominations.md"
cp "$NOMS" "$NOMS.bak"
rm -f "$CLAUDE_PROJECT_DIR/.claude/logs/pattern-counts.json" "$CLAUDE_PROJECT_DIR/.claude/logs/pattern-alerts.md"
COUNTS_FILE="$CLAUDE_PROJECT_DIR/.claude/logs/pattern-counts.json"
for i in 1 2 3 4 5; do
  run_hook '{"tool_name":"WebFetch","error":"ECONNREFUSED connect fixture-chain"}'
  assert_exit 0
  # The chain is backgrounded; wait for this occurrence to land before the next
  # (concurrent chain children would race the read-modify-write of the counts).
  for j in $(seq 1 30); do
    TOTAL=$(jq '[.[].count] | add // 0' "$COUNTS_FILE" 2>/dev/null)
    [ "${TOTAL:-0}" -ge "$i" ] 2>/dev/null && break
    sleep 0.1
  done
done
# The chain is async (backgrounded); poll briefly for the nomination.
CHAINED=1
for i in $(seq 1 30); do
  if grep -qF "pattern-detector" "$NOMS" 2>/dev/null; then CHAINED=0; break; fi
  sleep 0.1
done
[ "$CHAINED" -eq 0 ] || fail "5x NETWORK/ERROR failures did not produce a pattern nomination"
grep -qF "NETWORK" "$NOMS" || fail "nomination missing the NETWORK category"
mv "$NOMS.bak" "$NOMS"
rm -f "$CLAUDE_PROJECT_DIR/.claude/hooks/detect-patterns.sh" \
      "$CLAUDE_PROJECT_DIR/.claude/logs/pattern-counts.json" \
      "$CLAUDE_PROJECT_DIR/.claude/logs/pattern-alerts.md"

case_name "degrades: chain target absent is a silent no-op"
run_hook '{"tool_name":"Bash","error":"EACCES: Permission denied"}'
assert_exit 0

case_name "never breaks: malformed stdin"
run_hook 'garbage'
assert_exit 0

finish
