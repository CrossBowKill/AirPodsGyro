# Agent Memory

Per-agent persistent knowledge that survives across sessions (memory tier 2, see
CLAUDE.md, Memory Architecture). Each agent reads its own `MEMORY.md` at spawn
(injected by the `SubagentStart` mandatory-reads hook) and writes learnings back
after substantive work.

## The symmetry rule

**Every agent definition `.claude/agents/{name}.md` MUST have a matching
`.claude/agent-memory/{name}/MEMORY.md`.** An agent without a memory file runs
partially amnesiac: the mandatory-reads hook has nothing to inject, so the agent
relearns the same project facts every session.

Enforcement:
- `check-agent-memory-symmetry.sh` runs at every fresh SessionStart and prints a
  warning naming any agent missing its memory file (silent when symmetric).
- The hook test suite (`/test-hooks`) includes a strict symmetry proof.

When you add a new agent, create its memory folder and stub in the same change.

Exception: agents that deliberately SHARE one memory file (a pipeline of agents
writing a single MEMORY.md) or are deliberately stateless can be exempted by
listing their names, one per line, in a file matching
`.claude/agent-memory/*.symmetry-exempt` (specialist layers ship their own, for
example `seo.symmetry-exempt`, so layered installs never clobber each other's).

## Stub format

Keep stubs short: a title plus 2-4 empty sections with an HTML comment describing
what belongs there and its line format. Sections should reflect what THAT agent
needs to remember (patterns, conventions, resolved cases), not a generic list.
See any shipped `*/MEMORY.md` for the pattern.

## Hygiene

- Keep each MEMORY.md lean; `/memory-consolidate` merges duplicates, expires
  stale `[guessed]` entries, and prunes files that exceed ~150 lines.
- Tag entries `[verified]` or `[guessed]` so consolidation can tell facts from
  hypotheses.
- Durable, system-wide rules do not belong here: nominate them to
  `.claude/knowledge-nominations.md` so the auditor can promote them to the
  shared knowledge base.
