#!/bin/bash
# hook-proof: .claude/scripts/pulse-check.py ("did it fire" automation check, command-invoked by /pulse)
. "$(dirname "$0")/_assert.sh"
SCRIPT="$HOOKS_DIR/../scripts/pulse-check.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "    SKIP python3 not installed" >&2
  exit 0
fi

run_py() {
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  python3 -I "$SCRIPT" --root "$CLAUDE_PROJECT_DIR" --no-network "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

CFG="$CLAUDE_PROJECT_DIR/.claude/automations.yml"
SNAP="$CLAUDE_PROJECT_DIR/.claude/logs/pulse"
rm -rf "$SNAP"; rm -f "$CFG"
mkdir -p "$CLAUDE_PROJECT_DIR/.claude/logs"

case_name "self-test: the script's built-in proof passes"
STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
python3 -I "$SCRIPT" --self-test > "$STDOUT_FILE" 2> "$STDERR_FILE"; EXIT_CODE=$?
assert_exit 0
assert_stdout_contains "PASS"

case_name "unconfigured: no automations.yml degrades to UNCONFIGURED, exit 0"
run_py
assert_exit 0
assert_stdout_contains '"status": "UNCONFIGURED"'

# Fixture config: one fresh log, one stale log, one failing log, one n8n entry, one inactive.
cat > "$CFG" <<'EOF'
defaults:
  grace_factor: 1.5
automations:
  - name: Fresh job
    kind: cron
    check: cron-log
    path: .claude/logs/fresh.log
    expected_interval_hours: 24
  - name: Stale job
    kind: cron
    check: cron-log
    path: .claude/logs/stale.log
    expected_interval_hours: 1
  - name: Broken job
    kind: cron
    check: cron-log
    path: .claude/logs/broken.log
    expected_interval_hours: 24
    critical: true
  - name: Flow in n8n
    kind: n8n
    check: n8n-mcp
    workflow_name: "Flow"
  - name: Retired job
    kind: cron
    check: cron-log
    path: .claude/logs/retired.log
    active: false
EOF
NOW_TS=$(date +"%Y-%m-%d %H:%M")
echo "$NOW_TS fresh run ok" > "$CLAUDE_PROJECT_DIR/.claude/logs/fresh.log"
echo "run ok" > "$CLAUDE_PROJECT_DIR/.claude/logs/stale.log"
touch -t 202001010000 "$CLAUDE_PROJECT_DIR/.claude/logs/stale.log"
echo "$NOW_TS ERROR upstream rejected the request" > "$CLAUDE_PROJECT_DIR/.claude/logs/broken.log"

case_name "verdicts: OK, STALE or SILENT, FAILING, UNCHECKED, INACTIVE each land on the right entry"
run_py
assert_exit 0
python3 - "$STDOUT_FILE" <<'EOF' || fail "verdict mapping wrong (see stderr)"
import json, sys
r = json.load(open(sys.argv[1]))
v = {a["name"]: a["verdict"] for a in r["automations"]}
want = {"Fresh job": "OK", "Broken job": "FAILING", "Flow in n8n": "UNCHECKED", "Retired job": "INACTIVE"}
bad = [k for k, w in want.items() if v.get(k) != w]
if v.get("Stale job") not in ("STALE", "SILENT"): bad.append("Stale job")
if bad:
    print("wrong:", {k: v.get(k) for k in bad}, file=sys.stderr); sys.exit(1)
if r["status"] != "RED": print("status", r["status"], file=sys.stderr); sys.exit(1)
if r["summary"]["critical_failing"] != ["Broken job"]: print("critical", r["summary"], file=sys.stderr); sys.exit(1)
if any(a["change"] != "NEW" for a in r["automations"]): print("first run not NEW", file=sys.stderr); sys.exit(1)
EOF

case_name "snapshot: latest.json and a dated file are written"
assert_file_exists "$SNAP/latest.json"
[ "$(ls "$SNAP" | grep -c '^20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]\.json$')" -ge 1 ] || fail "no dated snapshot written"

case_name "diff: a repaired job reads RECOVERED, a newly broken one NEW-FAILURE"
echo "$NOW_TS run ok again" >> "$CLAUDE_PROJECT_DIR/.claude/logs/broken.log"
echo "$NOW_TS FAILED to write output" >> "$CLAUDE_PROJECT_DIR/.claude/logs/fresh.log"
run_py
assert_exit 0
python3 - "$STDOUT_FILE" <<'EOF' || fail "diff markers wrong (see stderr)"
import json, sys
r = json.load(open(sys.argv[1]))
c = {a["name"]: a["change"] for a in r["automations"]}
if c.get("Broken job") != "RECOVERED" or c.get("Fresh job") != "NEW-FAILURE" or c.get("Retired job") != "UNCHANGED":
    print(c, file=sys.stderr); sys.exit(1)
if r["summary"]["new_failures"] != ["Fresh job"] or r["summary"]["recovered"] != ["Broken job"]:
    print(r["summary"], file=sys.stderr); sys.exit(1)
EOF

case_name "read-only: logs and config untouched; --dry-run writes no snapshot"
assert_file_contains "$CLAUDE_PROJECT_DIR/.claude/logs/broken.log" "ERROR upstream"
rm -rf "$SNAP"
run_py --dry-run
assert_exit 0
assert_file_missing "$SNAP/latest.json"

case_name "never crashes: a malformed config reports ERROR, exit 1, valid JSON"
printf 'automations:\n  - name: x\n  nonsense without colon\n' > "$CFG"
run_py
assert_exit 1
assert_stdout_contains '"status": "ERROR"'

rm -rf "$SNAP"; rm -f "$CFG" "$CLAUDE_PROJECT_DIR"/.claude/logs/{fresh,stale,broken}.log
finish
