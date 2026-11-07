#!/bin/bash
# hook-proof: validate-hooks.sh (manual static lint over .claude/hooks + settings.json)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/validate-hooks.sh"

# Build a tiny project with its own hooks dir, so the lint runs against known
# files rather than the real hooks (which it also passes, but that is not a proof).
MINI=$(mktemp -d)
mkdir -p "$MINI/.claude/hooks/tests" "$MINI/.claude/commands"
printf '#!/bin/bash\n# fixture hook: always ok\nexit 0\n' > "$MINI/.claude/hooks/good.sh"
chmod +x "$MINI/.claude/hooks/good.sh"
printf '#!/bin/bash\n# proof for good.sh\nexit 0\n' > "$MINI/.claude/hooks/tests/test-good.sh"
cat > "$MINI/.claude/settings.json" <<'EOF'
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR/.claude/hooks/good.sh\""}]}]}}
EOF

run_lint() {
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  CLAUDE_PROJECT_DIR="$MINI" bash "$HOOK" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

case_name "passes: well-formed, wired, proven hook"
run_lint
assert_exit 0
assert_stdout_contains "0 failed"
assert_stdout_contains "wired, proof file present"

case_name "fails: syntax error in a hook"
printf '#!/bin/bash\n# broken fixture\nif [ 1 -eq 1 ; then echo x\n' > "$MINI/.claude/hooks/broken.sh"
chmod +x "$MINI/.claude/hooks/broken.sh"
run_lint
assert_exit 1
assert_stdout_contains "syntax error"
rm -f "$MINI/.claude/hooks/broken.sh"

case_name "fails: settings.json references a hook that is missing"
cat > "$MINI/.claude/settings.json" <<'EOF'
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR/.claude/hooks/good.sh\""},{"type":"command","command":"\"$CLAUDE_PROJECT_DIR/.claude/hooks/ghost.sh\""}]}]}}
EOF
run_lint
assert_exit 1
assert_stdout_contains "ghost.sh"
assert_stdout_contains "missing on disk"

case_name "fails then fixes: non-executable hook, --fix repairs it"
cat > "$MINI/.claude/settings.json" <<'EOF'
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR/.claude/hooks/good.sh\""}]}]}}
EOF
chmod -x "$MINI/.claude/hooks/good.sh"
run_lint
assert_exit 1
assert_stdout_contains "not executable"
run_lint --fix
assert_exit 0
[ -x "$MINI/.claude/hooks/good.sh" ] || fail "--fix did not restore the executable bit"

case_name "never breaks: invalid settings.json is a FAIL row, not a crash"
echo '{not json' > "$MINI/.claude/settings.json"
run_lint
assert_exit 1
assert_stdout_contains "settings.json"

rm -rf "$MINI"
finish
