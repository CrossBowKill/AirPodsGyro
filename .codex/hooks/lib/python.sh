#!/bin/bash
# Shared Python finder for hooks. Sourced, never run directly.
#
# claudify_python sets CLAUDIFY_PY to the first interpreter that actually runs
# Python 3, and returns 1 (with CLAUDIFY_PY empty) when none does. Each candidate
# is run, not just looked up, because on Windows `python3` is often the Microsoft
# Store alias: it exists on PATH but only prints "Python was not found", while
# the real install answers to `python` or `py -3`.
#
# CLAUDIFY_PY can be two words ("py -3"), so call it unquoted: $CLAUDIFY_PY -c '...'
# Set CLAUDIFY_PYTHON to force a specific interpreter.

claudify_python() {
  CLAUDIFY_PY=""
  local c
  for c in "${CLAUDIFY_PYTHON:-}" python3 python "py -3"; do
    [ -n "$c" ] || continue
    if $c -c 'import sys; sys.exit(sys.version_info[0] != 3)' </dev/null >/dev/null 2>&1; then
      CLAUDIFY_PY="$c"
      return 0
    fi
  done
  return 1
}
