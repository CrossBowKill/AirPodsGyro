#!/bin/bash
# hook-proof: shipped command contracts for /red-team, /capture, /memory-reconcile, /pulse, /gate-review.
# These commands have no hook of their own; this proves each file is well formed, references
# only files that ship beside it, and carries none of the banned markers.
. "$(dirname "$0")/_assert.sh"
CLAUDE_DIR="$(cd "$HOOKS_DIR/.." && pwd)"
ROOT="$(cd "$CLAUDE_DIR/.." && pwd)"

check_command() {
  local name="$1"
  local f="$CLAUDE_DIR/commands/$name.md"
  case_name "/$name: file exists with description and allowed-tools frontmatter"
  assert_file_exists "$f"
  [ -f "$f" ] || return
  head -1 "$f" | grep -q '^---$' || fail "no frontmatter"
  grep -q '^description:' "$f" || fail "no description"
  grep -q '^allowed-tools:' "$f" || fail "no allowed-tools"
  case_name "/$name: no em dashes, no unfinished-work markers"
  grep -q $'\xe2\x80\x94' "$f" && fail "em dash present"
  grep -q -E '\b(T[B]D|T[O]DO)\b' "$f" && fail "unfinished-work marker present"
  case_name "/$name: has an Output contract or Output section"
  grep -q -i -E '^## Output' "$f" || fail "no Output section"
}

for c in red-team capture memory-reconcile pulse gate-review; do check_command "$c"; done

case_name "/red-team: the change-red-team agent, its memory stub, and its mandatory-reads line ship"
assert_file_exists "$CLAUDE_DIR/agents/change-red-team.md"
assert_file_exists "$CLAUDE_DIR/agent-memory/change-red-team/MEMORY.md"
assert_file_contains "$HOOKS_DIR/mandatory-reads.yml" "change-red-team:"
grep -q -E '^tools:' "$CLAUDE_DIR/agents/change-red-team.md" || fail "agent has no tools block"
grep -q -E '^\s*- (Write|Edit)\s*$' "$CLAUDE_DIR/agents/change-red-team.md" && fail "reviewer must not hold Write or Edit"
grep -q 'DO NOT SHIP' "$CLAUDE_DIR/agents/change-red-team.md" || fail "agent lacks the DO NOT SHIP verdict"

case_name "/capture: the playbooks scaffold ships at the template root"
assert_file_exists "$ROOT/playbooks/README.md"
assert_file_exists "$ROOT/playbooks/_TEMPLATE.md"
assert_file_exists "$ROOT/playbooks/.gitkeep"
grep -q '^reuse-count: 0' "$ROOT/playbooks/_TEMPLATE.md" || fail "template lacks reuse-count"

case_name "/memory-reconcile: the health script and archive README ship, script compiles"
assert_file_exists "$CLAUDE_DIR/scripts/memory-health.py"
assert_file_exists "$CLAUDE_DIR/memory-archive/README.md"
if command -v python3 >/dev/null 2>&1; then
  python3 -m py_compile "$CLAUDE_DIR/scripts/memory-health.py" 2>/dev/null || fail "memory-health.py does not compile"
fi

case_name "/pulse: the check script and automations.yml template ship, template parses"
assert_file_exists "$CLAUDE_DIR/scripts/pulse-check.py"
assert_file_exists "$CLAUDE_DIR/automations.yml"
if command -v python3 >/dev/null 2>&1; then
  python3 -m py_compile "$CLAUDE_DIR/scripts/pulse-check.py" 2>/dev/null || fail "pulse-check.py does not compile"
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  python3 -I "$CLAUDE_DIR/scripts/pulse-check.py" --root "$ROOT" --config "$CLAUDE_DIR/automations.yml" \
    --snapshots "$CLAUDE_PROJECT_DIR/.claude/logs/pulse-contract" --no-network --dry-run > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
  assert_exit 0
  assert_stdout_contains '"total": 0'
fi

case_name "/gate-review: the approval-gates skill it points at ships with an eval"
SKILL="$CLAUDE_DIR/skills/development/approval-gates/SKILL.md"
[ -f "$SKILL" ] || SKILL="$CLAUDE_DIR/skills/approval-gates/SKILL.md"
assert_file_exists "$SKILL"
[ -f "$SKILL" ] && assert_file_exists "$(dirname "$SKILL")/evals/eval-001.yml"

finish
