#!/bin/bash
# hook-proof: staleness-scan.sh (decay-ledger scanner, read-only, command-invoked)
. "$(dirname "$0")/_assert.sh"
HOOK="$HOOKS_DIR/staleness-scan.sh"

# Self-contained fixture state: this test owns memory/ and the report file and
# never depends on shared fixture files (or leaves any behind).
MEM_DIR="$CLAUDE_PROJECT_DIR/memory"
LEDGER="$MEM_DIR/.staleness.json"
REPORT="$CLAUDE_PROJECT_DIR/.claude/logs/.staleness-report.md"
rm -rf "$MEM_DIR"
rm -f "$REPORT"
mkdir -p "$MEM_DIR"

# Stale file: mtime forced far in the past, 14d TTL.
echo "old domain notes" > "$MEM_DIR/old-domain.md"
touch -t 202001010000 "$MEM_DIR/old-domain.md"
# Fresh file: created now, must not be flagged.
echo "fresh domain notes" > "$MEM_DIR/fresh.md"
# Fresh mtime but stale dated entry stamps inside.
printf '# Entries\n- [010120] ancient decision kept around\n- [010120] second ancient line\n' > "$MEM_DIR/entries.md"

cat > "$LEDGER" <<'EOF'
{
  "version": 1,
  "files": {
    "memory/old-domain.md": {"ttl_class": "14d"},
    "memory/fresh.md": {"ttl_class": "14d"},
    "memory/entries.md": {"ttl_class": "14d"},
    "memory/gone.md": {"ttl_class": "90d"},
    ".claude/knowledge-base.md": {"ttl_class": "permanent"}
  }
}
EOF
touch -t 202001010000 "$CLAUDE_PROJECT_DIR/.claude/knowledge-base.md" 2>/dev/null

case_name "flags: file older than its TTL is a stale candidate"
run_hook ''
assert_exit 0
assert_stdout_contains "STALE FILE: memory/old-domain.md"

case_name "flags: stale dated [MMDDYY] stamps inside a fresh file"
assert_stdout_contains "STALE ENTRIES: memory/entries.md"
assert_stdout_contains "010120"

case_name "spares: fresh file and permanent-class file are not flagged"
grep -qF "STALE FILE: memory/fresh.md" "$STDOUT_FILE" && fail "fresh file wrongly flagged"
grep -qF "knowledge-base.md" "$STDOUT_FILE" && fail "permanent-class file wrongly flagged"

case_name "notes: registered-but-absent file reported as MISSING"
assert_stdout_contains "MISSING: memory/gone.md"

case_name "report: written to .claude/logs/.staleness-report.md"
assert_file_exists "$REPORT"
assert_file_contains "$REPORT" "STALE FILE: memory/old-domain.md"

case_name "read-only: scanner deleted and moved nothing"
assert_file_exists "$MEM_DIR/old-domain.md"
assert_file_exists "$MEM_DIR/entries.md"
assert_file_contains "$MEM_DIR/entries.md" "ancient decision"

case_name "never breaks: missing ledger degrades to a note, exit 0"
rm -f "$LEDGER"
run_hook ''
assert_exit 0
assert_stdout_contains "No decay ledger"

rm -rf "$MEM_DIR"
rm -f "$REPORT"
# Restore the shared fixture knowledge-base mtime this test aged.
touch "$CLAUDE_PROJECT_DIR/.claude/knowledge-base.md" 2>/dev/null
case_name "a project folder with a space in its name still scans"
SPACED="$CLAUDE_PROJECT_DIR/my project"
mkdir -p "$SPACED/memory" "$SPACED/.claude/logs"
echo "old fact" > "$SPACED/memory/fact_old.md"
touch -t 202001010000 "$SPACED/memory/fact_old.md"
printf '{\n  "files": {\n    "memory/*.md": {"ttl_class": "90d"}\n  }\n}\n' > "$SPACED/memory/.staleness.json"
CLAUDE_PROJECT_DIR="$SPACED" run_hook ''
assert_exit 0
assert_stdout_contains "STALE FILE: memory/fact_old.md"

finish
