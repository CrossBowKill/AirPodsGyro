#!/bin/bash
# hook-proof: lib/python.sh, the shared Python finder, and the hooks that use it.
# Simulates the Windows case where `python3` is the Microsoft Store alias: on
# PATH, but running it only prints "Python was not found". Hooks must fall
# through to an interpreter that really runs, or stand down cleanly.
. "$(dirname "$0")/_assert.sh"
. "$HOOKS_DIR/lib/python.sh"

REAL_PY=$(command -v python3 || command -v python)
STUBS=$(mktemp -d)
trap 'rm -rf "$STUBS"' EXIT

# stub <name>: an interpreter that exists on PATH but cannot run anything.
stub() {
  printf '#!/bin/sh\necho "Python was not found; run without arguments to install from the Microsoft Store" >&2\nexit 49\n' > "$STUBS/$1"
  chmod +x "$STUBS/$1"
}
# real <name>: an interpreter under that name that works.
real() {
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$REAL_PY" > "$STUBS/$1"
  chmod +x "$STUBS/$1"
}
ORIG_PATH="$PATH"

case_name "resolver: skips a python3 that cannot run, picks python"
stub python3; real python
PATH="$STUBS:$ORIG_PATH" claudify_python
[ "$CLAUDIFY_PY" = "python" ] || fail "expected 'python', got '$CLAUDIFY_PY'"

case_name "resolver: CLAUDIFY_PYTHON wins when it runs"
CLAUDIFY_PYTHON="$REAL_PY" PATH="$STUBS:$ORIG_PATH" claudify_python
[ "$CLAUDIFY_PY" = "$REAL_PY" ] || fail "expected the override, got '$CLAUDIFY_PY'"

case_name "resolver: returns 1 and empty when nothing runs"
stub python3; stub python; stub py
if PATH="$STUBS:$ORIG_PATH" claudify_python; then fail "expected failure, got '$CLAUDIFY_PY'"; fi
[ -z "$CLAUDIFY_PY" ] || fail "CLAUDIFY_PY should be empty, got '$CLAUDIFY_PY'"

case_name "auto-load-topics: hints still appear when python3 is the Store alias"
stub python3; real python
HOOK="$HOOKS_DIR/auto-load-topics.sh"
export PATH="$STUBS:$ORIG_PATH"
run_hook '{"prompt":"please deploy the app"}'
export PATH="$ORIG_PATH"
assert_exit 0
assert_stdout_contains "Auto-loaded context hints"

case_name "auto-load-topics: stands down cleanly when no Python runs"
stub python3; stub python; stub py
export PATH="$STUBS:$ORIG_PATH"
run_hook '{"prompt":"please deploy the app"}'
export PATH="$ORIG_PATH"
assert_exit 0
assert_stdout_empty

case_name "validate-hooks: names the missing Python instead of staying quiet"
HOOK="$HOOKS_DIR/validate-hooks.sh"
export PATH="$STUBS:$ORIG_PATH"
run_hook ''
export PATH="$ORIG_PATH"
assert_stdout_contains "no working Python 3"

case_name "validate-hooks: reports the interpreter it found"
stub python3; real python
export PATH="$STUBS:$ORIG_PATH"
run_hook ''
export PATH="$ORIG_PATH"
assert_stdout_contains "Python 3 runs as 'python'"

finish
