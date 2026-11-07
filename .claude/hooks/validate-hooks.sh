#!/bin/bash
# Manual maintenance script: static lint for every hook in .claude/hooks/.
# Run after editing a hook, after installing an update, or whenever settings.json
# changes: bash .claude/hooks/validate-hooks.sh [--fix] [--quiet]
#
# Checks (per script): shebang on line 1, a header comment on line 2, the
# executable bit, and `bash -n` syntax. Checks (project level): settings.json is
# valid JSON, every hook settings.json references exists on disk, every wired hook
# has a proof file in tests/, and unwired scripts are listed so orphans are visible.
#
# --fix   sets the executable bit on any hook that lacks it (the only mutation).
# --quiet prints the summary line and failures only.
#
# Exit 1 on any FAIL, exit 0 otherwise (WARN never fails the run). Pairs with the
# hook-proofs harness (/test-hooks): this script proves the hooks are well-formed
# and wired; the harness proves they behave.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"
TESTS_DIR="$HOOKS_DIR/tests"
SETTINGS="$PROJECT_DIR/.claude/settings.json"

FIX=0
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

PASS=0
WARN=0
FAIL=0

report() {
  # report <PASS|WARN|FAIL> <subject> <detail>
  case "$1" in
    PASS) PASS=$((PASS + 1)); [ "$QUIET" -eq 1 ] && return ;;
    WARN) WARN=$((WARN + 1)); [ "$QUIET" -eq 1 ] && return ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
  esac
  printf '%-5s %-34s %s\n' "$1" "$2" "$3"
}

if [ ! -d "$HOOKS_DIR" ]; then
  echo "validate-hooks: no hooks directory at $HOOKS_DIR" >&2
  exit 1
fi

[ "$QUIET" -eq 1 ] || {
  echo ""
  echo "validate-hooks: $HOOKS_DIR"
  echo ""
  printf '%-5s %-34s %s\n' "RESULT" "HOOK" "CHECK"
  printf '%-5s %-34s %s\n' "------" "----" "-----"
}

# ── 0. Python ────────────────────────────────────────────────────
# Some hooks need Python 3. Find one that actually runs (lib/python.sh), so a
# PATH entry that cannot run, such as the Windows Store python3 alias, is
# reported here instead of those hooks quietly doing nothing.
PY_OK=""
if . "$SCRIPT_DIR/lib/python.sh" 2>/dev/null && claudify_python; then
  PY_OK=1
  report PASS "python" "Python 3 runs as '$CLAUDIFY_PY'"
else
  report WARN "python" "no working Python 3 (tried python3, python, py -3); topic hints and Python-based checks are off until one is installed"
fi

# ── 1. settings.json ─────────────────────────────────────────────
WIRED=""
if [ ! -f "$SETTINGS" ]; then
  report WARN "settings.json" "missing (no hooks are wired; install step not finished?)"
else
  if command -v jq >/dev/null 2>&1; then
    if jq empty "$SETTINGS" >/dev/null 2>&1; then
      report PASS "settings.json" "valid JSON"
    else
      report FAIL "settings.json" "invalid JSON (every hook is disabled until this parses)"
    fi
  elif [ -n "$PY_OK" ]; then
    if SETTINGS_PATH="$SETTINGS" $CLAUDIFY_PY - >/dev/null 2>&1 <<'PY'
import json, os
json.load(open(os.environ["SETTINGS_PATH"]))
PY
    then
      report PASS "settings.json" "valid JSON"
    else
      report FAIL "settings.json" "invalid JSON (every hook is disabled until this parses)"
    fi
  else
    report WARN "settings.json" "neither jq nor a working Python 3 found, JSON validity not checked"
  fi

  # Every .claude/hooks/*.sh reference in settings.json must exist on disk.
  WIRED=$(grep -o '\.claude/hooks/[A-Za-z0-9._-]*\.sh' "$SETTINGS" 2>/dev/null | sort -u | sed 's|\.claude/hooks/||')
  for ref in $WIRED; do
    if [ -f "$HOOKS_DIR/$ref" ]; then
      report PASS "$ref" "referenced in settings.json and present"
    else
      report FAIL "$ref" "referenced in settings.json but missing on disk"
    fi
  done
fi

# ── 2. Per-script checks ─────────────────────────────────────────
is_wired() {
  echo "$WIRED" | grep -qx "$1"
}

is_helper() {
  # A script that another hook or command invokes by name counts as wired.
  grep -rl --include='*.sh' --include='*.md' -F "$1" "$HOOKS_DIR" "$PROJECT_DIR/.claude/commands" 2>/dev/null \
    | grep -v "/tests/" | grep -v "/$1\$" | grep -v "README.md" | grep -q .
}

for hook in "$HOOKS_DIR"/*.sh; do
  [ -f "$hook" ] || continue
  name=$(basename "$hook")

  # Shebang
  if head -1 "$hook" | grep -q '^#!'; then
    report PASS "$name" "shebang"
  else
    report FAIL "$name" "no shebang on line 1"
  fi

  # Header comment (the WHY sits next to the WHAT)
  if sed -n '2p' "$hook" | grep -q '^#'; then
    report PASS "$name" "header comment"
  else
    report WARN "$name" "no header comment on line 2 (document event, purpose, failure mode)"
  fi

  # Executable bit
  if [ -x "$hook" ]; then
    report PASS "$name" "executable"
  elif [ "$FIX" -eq 1 ] && chmod +x "$hook" 2>/dev/null; then
    report PASS "$name" "executable (fixed with --fix)"
  else
    report FAIL "$name" "not executable (run with --fix, or chmod +x)"
  fi

  # Syntax
  if bash -n "$hook" >/dev/null 2>&1; then
    report PASS "$name" "bash -n syntax"
  else
    report FAIL "$name" "syntax error: $(bash -n "$hook" 2>&1 | head -1 | cut -c1-120)"
  fi

  # Wiring + proof
  base="${name%.sh}"
  if is_wired "$name"; then
    if [ -f "$TESTS_DIR/test-${base}.sh" ] || [ -f "$TESTS_DIR/test-${base#check-}.sh" ]; then
      report PASS "$name" "wired, proof file present"
    else
      report WARN "$name" "wired but no tests/test-${base}.sh proof (run /test-hooks after adding one)"
    fi
  elif sed -n '2,4p' "$hook" | grep -qi 'manual'; then
    report PASS "$name" "manual script (header says so; run it by hand or from cron)"
  elif is_helper "$name"; then
    report PASS "$name" "helper script (invoked by another hook or command)"
  else
    report WARN "$name" "not wired in settings.json and not invoked elsewhere (see hooks/README.md for the settings block, or remove it)"
  fi
done

# ── 3. Summary ───────────────────────────────────────────────────
[ "$QUIET" -eq 1 ] || echo ""
echo "validate-hooks summary: $PASS passed, $WARN warnings, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
