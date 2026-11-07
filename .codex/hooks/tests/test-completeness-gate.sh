#!/bin/bash
# hook-proof: completeness-gate.sh (PreToolUse Write|Edit gate)
# Blocks via structured JSON (permissionDecision deny) with exit 0, as documented
# in the hook header. That is the shipped block mechanism for PreToolUse.
# Violating fixtures are assembled from parts so no gate pattern-matches this
# test file itself.
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/completeness-gate.sh"

case_name "blocks: incomplete marker in knowledge-base.md denied"
MARKER="TB""D"
PAYLOAD=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.claude/knowledge-base.md","content":"- **Rule**: %s later [Source: x]"}}' "$CLAUDE_PROJECT_DIR" "$MARKER")
run_hook "$PAYLOAD"
assert_exit 0
assert_stdout_contains '"permissionDecision": "deny"'
assert_stdout_contains "COMPLETENESS GATE"

case_name "blocks: apparent secret in a non-env file denied"
SECRETISH="sk-liv""e-ABCDEFGHIJKLMNOPQRSTUVWX"
PAYLOAD=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/notes.md","content":"key is %s"}}' "$CLAUDE_PROJECT_DIR" "$SECRETISH")
run_hook "$PAYLOAD"
assert_exit 0
assert_stdout_contains '"permissionDecision": "deny"'

case_name "fires-clean: ordinary file passes through"
PAYLOAD=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/notes.md","content":"hello world"}}' "$CLAUDE_PROJECT_DIR")
run_hook "$PAYLOAD"
assert_exit 0
assert_stdout_empty

case_name "never breaks: malformed stdin"
run_hook 'garbage'
assert_exit 0

finish

case_name "blocks: one knowledge-base section over 200 lines denied"
BIG=$(awk 'BEGIN { for (i = 1; i <= 201; i++) printf "line %d\\n", i }')
PAYLOAD=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.claude/knowledge-base.md","content":"%s"}}' "$CLAUDE_PROJECT_DIR" "$BIG")
run_hook "$PAYLOAD"
assert_exit 0
assert_stdout_contains '"permissionDecision": "deny"'

case_name "allows: a bundle knowledge-base with engine sections each under 200 lines"
PART=$(awk 'BEGIN { for (i = 1; i <= 150; i++) printf "line %d\\n", i }')
PAYLOAD=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.claude/knowledge-base.md","content":"%s# === SEO Specialist Knowledge Base ===\\n%s# === Content Specialist Knowledge Base ===\\n%s"}}' "$CLAUDE_PROJECT_DIR" "$PART" "$PART" "$PART")
run_hook "$PAYLOAD"
assert_exit 0
grep -qF '"permissionDecision": "deny"' "$STDOUT_FILE" && fail "bundle knowledge-base wrongly denied"
