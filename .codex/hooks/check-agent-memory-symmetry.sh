#!/bin/bash
# Agent-memory symmetry check.
# Rule: every agent definition .claude/agents/{name}.md must have a matching
# persistent memory file .claude/agent-memory/{name}/MEMORY.md. The
# SubagentStart mandatory-reads hook injects that memory at spawn time, so an
# agent without one runs partially amnesiac every session.
#
# Modes:
#   default   : advisory. Prints a short warning ONLY when asymmetry exists
#               (SessionStart output is injected as context, so silence is the
#               common, token-free case). Always exits 0.
#   --strict  : exits 1 when any agent lacks a MEMORY.md (used by hook tests
#               and audits).
# Fail-open in default mode: never blocks a session.
#
# Exemptions: agents that deliberately use a SHARED memory file (a pipeline of
# agents writing one MEMORY.md) or are deliberately stateless can be listed,
# one name per line (# comments allowed), in any file matching
# .claude/agent-memory/*.symmetry-exempt. Layered installs each ship their own
# exempt file (for example seo.symmetry-exempt) so overlays never clobber.

STRICT=0
[ "$1" = "--strict" ] && STRICT=1

# Drain stdin so the hook pipe never blocks (payload unused).
cat > /dev/null 2>&1

AGENTS_DIR="$CLAUDE_PROJECT_DIR/.claude/agents"
MEMORY_DIR="$CLAUDE_PROJECT_DIR/.claude/agent-memory"

[ -d "$AGENTS_DIR" ] || exit 0

# Collect exempted agent names from every *.symmetry-exempt file.
EXEMPT=" "
for EXEMPT_FILE in "$MEMORY_DIR"/*.symmetry-exempt "$MEMORY_DIR"/.symmetry-exempt; do
  [ -f "$EXEMPT_FILE" ] || continue
  while IFS= read -r LINE; do
    LINE=$(echo "$LINE" | sed 's/#.*//' | tr -d '[:space:]')
    [ -n "$LINE" ] && EXEMPT="$EXEMPT$LINE "
  done < "$EXEMPT_FILE"
done

MISSING=""
for AGENT_FILE in "$AGENTS_DIR"/*.md; do
  [ -e "$AGENT_FILE" ] || continue
  NAME=$(basename "$AGENT_FILE" .md)
  # Skip README-style files that are not agent definitions.
  case "$NAME" in
    README|_*) continue ;;
  esac
  case "$EXEMPT" in
    *" $NAME "*) continue ;;
  esac
  if [ ! -f "$MEMORY_DIR/$NAME/MEMORY.md" ]; then
    MISSING="$MISSING $NAME"
  fi
done

if [ -n "$MISSING" ]; then
  echo "AGENT-MEMORY SYMMETRY: missing MEMORY.md for:$MISSING. Create .claude/agent-memory/{name}/MEMORY.md for each (see .claude/agent-memory/README.md for the stub format) so the SubagentStart hook can inject persistent memory."
  [ "$STRICT" = "1" ] && exit 1
fi

exit 0
