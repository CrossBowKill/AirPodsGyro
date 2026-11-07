---
name: "source-command-retro"
description: "Sprint retrospective - review what worked, what didn't, improve process"
---

# source-command-retro

Use this skill when the user asks to run the migrated source command `retro`.

## Command Template

**Spawn synchronously:** every Agent/Task spawn in this procedure must pass `run_in_background: false`. Subagents default to background since Codex 2.1.198; this command consumes each subagent verdict before its next step, so a background spawn would race the verdict.

Retrospective analysis. Review a time period, extract patterns, improve the system.

## Steps

### Step 1: Determine scope

If user specified a time period, use that. Otherwise default to "this week."

### Step 2: Gather data (parallel reads)

Read simultaneously:
- Recent daily notes (last 5-7 days)
- `.Codex/logs/verdicts.jsonl` (session quality trends)
- `.Codex/logs/incident-log.md` (issues and blocks)
- `.Codex/logs/failure-log.md` (tool failures)
- `.Codex/knowledge-nominations.md` (pending learnings)
- `Task Board.md` (completion rate)

### Step 3: Analyze patterns

**What went well?**
- Tasks completed on time
- Smooth workflows (no blocks)
- Learnings successfully captured
- Quality verdicts trending positive

**What didn't go well?**
- Repeated failures (same error type)
- Blocked commands that should have been allowed
- Tasks that took much longer than expected
- Sessions compacting often (count the COMPACTION rows in `.Codex/logs/incident-log.md`)
- Quality verdict blocks

**What to change?**
- Are there process bottlenecks?
- Are hooks too strict or too lenient?
- Are agents missing capabilities?
- Are commands missing or underused?

### Step 4: Extract improvements

For each identified improvement:
1. Is it a **knowledge-base rule**? → Promote directly
2. Is it a **process change**? → Add to Scratchpad for user review
3. Is it a **tool/config change**? → Create task on Task Board
4. Is it a **pattern to watch**? → Nominate to knowledge-nominations

### Step 5: Write retro report

Add to daily note:

```markdown
## Retrospective, [period]

### Went Well
- [bullets]

### Didn't Go Well
- [bullets]

### Action Items
- [ ] [specific improvement with owner]

### Metrics
- Tasks completed: [X]
- Quality verdict pass rate: [X]%
- Incidents: [X] (CRITICAL: [X], HIGH: [X])
- Context flushes: [X]
```

### Step 6: Create action items

Add any actionable improvements to `Task Board.md` → This Week.
