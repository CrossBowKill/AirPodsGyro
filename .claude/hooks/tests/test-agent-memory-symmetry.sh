#!/bin/bash
# hook-proof: check-agent-memory-symmetry.sh (agents/{n}.md implies agent-memory/{n}/MEMORY.md)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/check-agent-memory-symmetry.sh"
AGENTS="$CLAUDE_PROJECT_DIR/.claude/agents"
MEM="$CLAUDE_PROJECT_DIR/.claude/agent-memory"

case_name "symmetric: agent with memory produces no output"
echo "# Auditor agent" > "$AGENTS/auditor.md"
run_hook ''
assert_exit 0
assert_stdout_empty

case_name "detects: agent without memory is named in the warning"
echo "# Ghost agent" > "$AGENTS/ghost.md"
run_hook ''
assert_exit 0
assert_stdout_contains "AGENT-MEMORY SYMMETRY"
assert_stdout_contains "ghost"

case_name "strict: --strict exits 1 on asymmetry"
STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
printf '' | bash "$HOOK" --strict > "$STDOUT_FILE" 2> "$STDERR_FILE"
EXIT_CODE=$?
assert_exit 1
assert_stdout_contains "ghost"

case_name "heals: creating the MEMORY.md clears the warning"
mkdir -p "$MEM/ghost"
echo "# Ghost Memory" > "$MEM/ghost/MEMORY.md"
run_hook ''
assert_exit 0
assert_stdout_empty

case_name "skips: README.md in agents dir is not an agent"
echo "# About agents" > "$AGENTS/README.md"
run_hook ''
assert_exit 0
assert_stdout_empty

case_name "exempts: agent listed in *.symmetry-exempt is not flagged"
echo "# Swarm agent" > "$AGENTS/swarm-worker.md"
printf '# shared-memory pipeline\nswarm-worker\n' > "$MEM/fixture.symmetry-exempt"
run_hook ''
assert_exit 0
assert_stdout_empty
rm -f "$AGENTS/swarm-worker.md" "$MEM/fixture.symmetry-exempt"

rm -f "$AGENTS/auditor.md" "$AGENTS/ghost.md" "$AGENTS/README.md"
rm -rf "$MEM/ghost"
finish
