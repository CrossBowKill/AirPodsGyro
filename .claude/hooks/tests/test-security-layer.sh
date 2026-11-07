#!/bin/bash
# hook-proof: /security-sweep, /skill-intake, /leak-check contracts, plus .claude/scripts/security-scan.sh.
# The commands have no hook of their own. This proves each file is well formed, that what they
# point at ships beside them, and that the scan finds a planted key without ever printing it.
. "$(dirname "$0")/_assert.sh"
CLAUDE_DIR="$(cd "$HOOKS_DIR/.." && pwd)"
SCAN="$CLAUDE_DIR/scripts/security-scan.sh"

for name in security-sweep skill-intake leak-check; do
  f="$CLAUDE_DIR/commands/$name.md"
  case_name "/$name: file exists with description and allowed-tools frontmatter"
  assert_file_exists "$f"
  [ -f "$f" ] || continue
  head -1 "$f" | grep -q '^---$' || fail "no frontmatter"
  grep -q '^description:' "$f" || fail "no description"
  grep -q '^allowed-tools:' "$f" || fail "no allowed-tools"
  case_name "/$name: has an Output section and treats what it reads as data"
  grep -q -i -E '^## Output' "$f" || fail "no Output section"
  grep -q 'never instructions' "$f" || fail "no data-not-instructions rule"
done

case_name "the security page and the patterns file ship"
assert_file_exists "$CLAUDE_DIR/security/README.md"
assert_file_exists "$CLAUDE_DIR/security/patterns.tsv"
assert_file_contains "$CLAUDE_DIR/security/README.md" "approval-gates"

case_name "every pattern line has four tab-separated columns"
BAD=$(grep -E '^(SECRET|EXPOSE)' "$CLAUDE_DIR/security/patterns.tsv" | awk -F'\t' 'NF != 4' | wc -l | tr -d ' ')
[ "$BAD" = "0" ] || fail "$BAD malformed pattern lines"

P="$CLAUDE_PROJECT_DIR/scan-fixture"
rm -rf "$P"
mkdir -p "$P/.claude/security" "$P/src"
cp "$CLAUDE_DIR/security/patterns.tsv" "$P/.claude/security/patterns.tsv"
# Built at run time, so this file holds no key-shaped text for a scanner to trip on.
SECRET_VALUE="sk_""live_""$(printf 'FAKE%.0s' 1 2 3 4 5)1234"
printf 'const k = "%s";\n' "$SECRET_VALUE" > "$P/src/config.js"
printf 'STRIPE_KEY=%s_EXAMPLEKEY1234567890\n' "sk_""live" > "$P/src/sample.txt"
printf 'FOO=bar\n' > "$P/.env"
printf 'FOO=\n' > "$P/.env.example"
printf 'app.listen(3000, "0.0.0.0")\n' > "$P/src/server.js"

run_scan() {
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  bash "$SCAN" --root "$P" "$@" > "$STDOUT_FILE" 2> "$STDERR_FILE"
  EXIT_CODE=$?
}

case_name "scan: finds the key, the env file and the bind, with file and line"
run_scan
assert_exit 0
assert_stdout_contains "stripe live key"
assert_stdout_contains "src/config.js:1"
assert_stdout_contains "src/server.js:1"
assert_stdout_contains ".env"
assert_stdout_contains "DONE"

case_name "scan: never prints the value"
grep -qF "$SECRET_VALUE" "$STDOUT_FILE" && fail "the scan printed a secret value"

case_name "scan: a placeholder is marked soft, not dropped"
grep -E 'src/sample.txt:1' "$STDOUT_FILE" | grep -q 'soft' || fail "placeholder not marked soft"

case_name "scan: .env.example is not listed as an env file"
grep -qF '.env.example' "$STDOUT_FILE" && fail ".env.example was listed"

case_name "scan: --only limits the scan to one file"
run_scan --only src/server.js
assert_exit 0
grep -qF 'src/config.js' "$STDOUT_FILE" && fail "--only scanned another file"

case_name "scan: --only works with a full path"
run_scan --only "$P/src/config.js"
assert_exit 0
assert_stdout_contains "stripe live key"

case_name "scan: --only on a missing file stops with exit 2, never a clean DONE"
run_scan --only src/no-such-file.js
assert_exit 2
grep -qF 'DONE' "$STDOUT_FILE" && fail "a missing file reported DONE"

case_name "scan: read-only, the planted file is untouched"
assert_file_contains "$P/src/config.js" "$SECRET_VALUE"

case_name "scan: a file name cannot write a file through sed"
BAD_NAME='a:1p;w OUT'
printf 'x = %s\n' "$SECRET_VALUE" > "$P/$BAD_NAME"
run_scan
assert_exit 0
assert_file_missing "$P/OUTp"
assert_file_missing "$P/OUT"
rm "$P/$BAD_NAME"

case_name "scan: a missing patterns file stops with exit 2"
rm "$P/.claude/security/patterns.tsv"
run_scan
assert_exit 2

rm -rf "$P"
finish
