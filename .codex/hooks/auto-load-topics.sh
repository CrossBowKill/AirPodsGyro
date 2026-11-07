#!/bin/bash
# UserPromptSubmit hook: scans the user's incoming message for known topic keywords
# and surfaces relevant memory/skill files as a "you should probably read these" hint.
# Does NOT force reading, just makes Claude aware of what's relevant.
# Reads keyword-to-file map from .claude/hooks/topic-routing.yml.

set +e

ROUTING="$CLAUDE_PROJECT_DIR/.claude/hooks/topic-routing.yml"
[ ! -f "$ROUTING" ] && exit 0

# A Python 3 that actually runs, not just one on PATH (see lib/python.sh).
. "$(dirname "$0")/lib/python.sh" 2>/dev/null && claudify_python || exit 0

# Read user prompt from stdin (UserPromptSubmit JSON payload)
PAYLOAD=$(cat 2>/dev/null || echo '{}')
PROMPT=$(echo "$PAYLOAD" | $CLAUDIFY_PY -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('prompt', '') or d.get('message', '') or '')
except Exception:
    pass
" 2>/dev/null)

[ -z "$PROMPT" ] && exit 0

# Lowercase for case-insensitive matching
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# Parse routing.yml, extract keywords + their associated paths
# Output format: keyword|path1,path2,...
# Values pass through the environment, never interpolated into Python source:
# interpolation broke on Windows paths and let a prompt containing quotes
# escape the string literal and execute as code.
PY_ROUTING="$ROUTING"
PY_PROJECT="${CLAUDE_PROJECT_DIR:-.}"
if command -v cygpath >/dev/null 2>&1; then
  PY_ROUTING=$(cygpath -w "$ROUTING" 2>/dev/null || printf '%s' "$ROUTING")
  PY_PROJECT=$(cygpath -w "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-.}")
fi
MATCHES=$(ROUTING_PATH="$PY_ROUTING" PROMPT_LOWER="$PROMPT_LOWER" PROJECT_DIR="$PY_PROJECT" PYTHONIOENCODING=utf-8 $CLAUDIFY_PY -c "
import re, os, sys

routing_path = os.environ['ROUTING_PATH']
prompt_lower = os.environ['PROMPT_LOWER']

# Naive YAML parse, handles the simple format we wrote
keywords = {}
current_kw = None
with open(routing_path) as f:
    for line in f:
        line = line.rstrip()
        if not line or line.startswith('#'): continue
        # New keyword line: 'keyword:' or '\"keyword with spaces\":'
        m = re.match(r'^([\"\\w][\\w \"-]*?):$', line)
        if m:
            current_kw = m.group(1).strip('\"').lower()
            keywords[current_kw] = []
            continue
        # File path line: '  - path/to/file'
        m = re.match(r'^  - (.+)$', line)
        if m and current_kw:
            keywords[current_kw].append(m.group(1).strip())

# Find matches in prompt
matched_files = set()
matched_kw = []
for kw, paths in keywords.items():
    if kw in prompt_lower:
        matched_kw.append(kw)
        for p in paths:
            matched_files.add(p)

if matched_files:
    project_dir = os.environ.get('PROJECT_DIR', '.')
    print(f'Detected topics: {\", \".join(matched_kw[:5])}')
    print('Relevant context files (read if not already loaded):')
    for p in sorted(matched_files)[:8]:
        full = p if os.path.isabs(p) else os.path.join(project_dir, p)
        marker = '✓' if os.path.exists(full) else '✗ (missing)'
        print(f'  {marker} {p}')
" 2>/dev/null)

if [ -n "$MATCHES" ]; then
  echo ""
  echo "─── Auto-loaded context hints ───"
  echo "$MATCHES"
  echo "─────────────────────────────────"
fi

exit 0
