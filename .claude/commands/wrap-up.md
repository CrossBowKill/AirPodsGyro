---
description: End of day - sync memory, clear done list, externalize knowledge, prep tomorrow
argument-hint: ""
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash(date:*)
  - Bash(bash:*)
  - Agent
  - mcp__memory__create_entities
  - mcp__memory__create_relations
  - mcp__memory__add_observations
---

**Spawn synchronously:** every Agent/Task spawn in this procedure must pass `run_in_background: false`. Subagents default to background since Claude Code 2.1.198; this command consumes each subagent verdict before its next step, so a background spawn would race the verdict.

End-of-day ritual. Externalize knowledge, clean up, prepare for tomorrow.

## Steps

### Step 1: Read current state (parallel)

Read simultaneously:
- `.claude/memory.md`
- `Daily Notes/MMDDYY.md` (today)
- `Scratchpad.md`
- `Task Board.md`

### Step 2: Process remaining scratchpad items

Same as /sync Step 2. Clear everything, scratchpad should be empty at end of day.

### Step 3: Sync memory

Edit `.claude/memory.md`:
- Update "Now" to reflect where things stand
- Resolve completed Open Threads
- Prune stale Recent Decisions (older than 1 week)
- Clear resolved Blockers

### Step 4: Move completed tasks

In `Task Board.md`:
- Move all completed tasks from Today → Done
- Clear Done list if it's Friday
- Move incomplete Today items to This Week or Backlog with a note on why

### Step 5: Knowledge externalization

Review today's work for learnings:
- **User corrections**: Anything the user explicitly corrected → nominate to `.claude/knowledge-nominations.md`
- **Empirical discoveries**: Things proven through testing → nominate
- **Pattern observations**: Recurring patterns noticed → nominate
- **Failure lessons**: Root cause of any resolved failures → nominate

Format: `- [MMDDYY] /wrap-up: [learning] | Evidence: [source]`

### Step 5b: Write the knowledge graph (only if the memory MCP server is present)

Memory tier 5 (see CLAUDE.md, Memory Architecture) is the optional `memory` MCP
server. If `mcp__memory__*` tools are available in this session, persist today's
durable structure so future sessions can query it:

1. For each durable subject worked on today (a project, a system, a person, a
   service), ensure an entity exists: `mcp__memory__create_entities` for new ones
   (entityType such as `project`, `system`, `person`, `decision`).
2. Add 1-3 dated observations per touched entity via
   `mcp__memory__add_observations` (facts and decisions, not activity narration:
   "MMDDYY: auth moved to session cookies, JWT rejected for size" is right,
   "worked on auth today" is noise).
3. Record new relationships via `mcp__memory__create_relations` (for example
   `project X -> depends_on -> service Y`) only when one was actually established
   or discovered today.

Budget: 2-4 calls. Only durable facts go to the graph; session-scoped detail
belongs in the daily note.

If the `mcp__memory__*` tools are NOT available, skip this step silently. Do not
mention the missing server and do not error. The nominations file and daily note
(Steps 5 and 9) already capture everything on disk.

### Step 5c: Append today's episode to the episodic ledger

Record the day as one episode (memory tier 7, `memory/episodes/`). One call, from
in-context knowledge of the day:

```bash
bash .claude/hooks/episode-append.sh \
  --task "{one line: what today's work was about}" \
  --outcome {success|partial|fail} \
  --domain "{short domain label, e.g. auth, billing, docs}" \
  --files "{comma-separated key file paths touched}" \
  --decision "{one line: the most load-bearing decision, or empty}" \
  --lesson "{one line lesson, or omit the flag entirely}"
```

Outcome honestly: `success` only if the day's main task actually finished,
`partial` if it moved but is unfinished, `fail` if it stalled or regressed. The
script maintains `memory/episodes/INDEX.md` (20-line cap) itself and never fails
this command. Query the ledger later with `/recall`.

### Step 6: Mandatory daily audit

Spawn the auditor agent to review today's work:

```
Agent(auditor): Review today's work in Daily Notes/MMDDYY.md. Check:
1. Were all tasks completed or properly deferred?
2. Were any knowledge-base rules violated?
3. Are there any pending nominations to review?
Tier: T1 (quick scan). Report findings.
```

### Step 7: Review incident log

Read `.claude/logs/incident-log.md`. Summarize any notable events.

### Step 8: Preview tomorrow

Based on Task Board and Open Threads, suggest 1-3 priorities for tomorrow.
Add them to Task Board → Today.

### Step 9: Update daily note

Add to `Daily Notes/MMDDYY.md` → End of Day Summary:
- Key accomplishments
- Decisions made
- Open items carried forward
- Tomorrow's priorities

If work is carrying over, refresh the Session Handoff in the same note (format in `/safe-clear` Step 3), so the next session can pick up from its Next action.

### Step 10: Sign off

Brief message: what was accomplished today, what's next tomorrow.
