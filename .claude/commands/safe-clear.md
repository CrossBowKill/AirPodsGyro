---
description: Save session state to disk as a Session Handoff. Optional, for when you want an explicit save point
argument-hint: ""
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash(date:*)
  - Bash(rm:*)
  - Bash(bash:*)
  - Bash(grep:*)
---

Persist session state to disk, then stop. This is optional: Claude keeps a Session Handoff warm as it works, and Claude Code compacts on its own when the conversation fills. Use this when you want an explicit save point. If you also want to flush straight away, `/compact` is there for you.

**When this runs:** Only when the user asks for an explicit distill. Claude never recommends it proactively; native auto-compact plus the `SessionStart(compact)` resume hook handle the automatic case (see CLAUDE.md, Context Health). The shipped signals behind the backstop: `track-session-quality.sh` (PostToolUse) counts tools and re-reads into `.claude/logs/.session-quality-state`, `log-stop-verdict.sh` (Stop) counts blocked verdicts, and at 2+ blocks `check-quality-gate.sh` blocks the turn until state is persisted. When that gate fires, Claude carries out these steps itself.

**Critical constraint:** A custom command cannot clear its own context. Every read/write inside this command ADDS tokens. The actual reduction happens when Claude Code compacts, on its own or through `/compact` if the user chooses. This command's job is to make sure the session after that can resume cleanly.

**Emergency mode** (compacting/prompt-too-long warning already showing): Skip Step 1 (file reads), distill from in-context memory only. Go straight to Step 2.

---

## Steps

### Step 0: Reset gate files + get date + check hook environment

```bash
date +"%m%d%y %H:%M" && rm -f ".claude/logs/.quality-gate-active" ".claude/logs/.session-blocks-$(date +"%m%d-%H")" ".claude/logs/.tool-call-count" ".claude/logs/.compaction-occurred"
```

**Hook freshness check (graceful degradation for sessions started before hook upgrades):**

```bash
# If session-quality-state hasn't been updated in last 60s despite tool use, the
# PostToolUse track-session-quality.sh hook isn't loaded in this session.
# If absent, this command does the equivalent work inline as fallback.
STATE_FILE=".claude/logs/.session-quality-state"
if [ -f "$STATE_FILE" ]; then
  STATE_AGE=$(( $(date +%s) - $(stat -f %m "$STATE_FILE" 2>/dev/null || stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0) ))
else
  STATE_AGE=99999
fi
echo "Quality state age: ${STATE_AGE}s. If >300s in an active session, hooks not loaded, using manual fallbacks below."
```

If `STATE_AGE > 300`: the new tier-tracking hooks aren't loaded in this session (it predates the upgrade). Note this in the output and skip the hook-dependent steps. The user will get full functionality on their next fresh session; this run still does the manual distillation work that matters most.

### Step 1: Read state (SKIP IN EMERGENCY)

Only if context is comfortably below 90%. If above, skip, distill from in-context memory. Reading files burns more tokens than the distillation saves.

When safe: read `.claude/memory.md` + `Daily Notes/MMDDYY.md` in parallel.

### Step 2: Distill session (from in-context memory)

Extract and compress using **restorable compression**, preserve retrieval paths so the post-compact session can restore full context from the handoff alone:

1. **Task**, one sentence (what was the user trying to do this session)
2. **Done**, 2-4 bullets, conclusions not process
3. **Remaining**, 2-4 bullets, precise next steps
4. **Decisions**, one line each, WHAT+WHY (not HOW)
5. **Learnings**, rules/facts worth promoting (Step 4 will write them)
6. **Files touched**, full paths of every file read or modified. Include key reads, not just writes, these are the retrieval anchors.
7. **Active references**, URLs, API endpoints, file names, external resources. Drop content, keep pointers.
8. **Open threads**, anything in flight awaiting a result (a running job, a review, an unanswered question). Flagging it here ensures resume-prompt visibility.
9. **Next action**, precise, actionable instruction including which file(s) to read FIRST when work resumes.

### Step 3: Write handoff to daily note

Append (or create) today's daily note (`Daily Notes/MMDDYY.md`) with:

```markdown
## Session Handoff, HH:MM

**Task:** [one sentence]
**Done:**
- [bullet]
- [bullet]
**Remaining:**
- [bullet]
- [bullet]
**Decisions:**
- [bullet]
**Files:** [full paths, both modified and key reads]
**Refs:** [URLs, file names, external resources, pointers only]
**Open threads:** [in-flight items or "none"]
**Next:** [precise action + which file(s) to read first]
```

This is what the post-compact-resume hook will read.

### Step 4: Update memory.md (only if changed)

If priorities, threads, or decisions shifted this session → edit `.claude/memory.md`. Nothing changed → skip. Do not edit just to log "session occurred", memory.md must stay <100 lines.

### Step 4b: Domain-routed updates (NEW, write to specialised memory files)

After writing the daily note Handoff, identify which **domains** this session touched. Each domain has a dedicated memory file. Append a brief, dated update to each one that's relevant.

**Detection rule:** Read `.claude/hooks/topic-routing.yml` for the canonical keyword→file map. For each keyword that materially appeared in this session's work (not in passing, must have been the subject of substantive work), append to that keyword's destination file(s).

**Update format** (use exactly this, append to the file's most relevant section, or append to end if unclear):

```markdown
- [MMDDYY] {one-line summary of what happened in this session relating to this domain}. {Optional: link to today's daily note}.
```

**Examples** (the destinations come from YOUR `topic-routing.yml`, these are illustrative):
- Worked on a deploy → append to `memory/deployment-notes.md`
- Touched a third-party integration → append to that integration's project memory (e.g. `memory/integration_{name}.md`)
- Made a reusable testing decision → append to `.claude/skills/testing/SKILL.md` if it's a durable rule, or skip if routine

**Skip if:** the work was incidental (e.g., briefly mentioned a topic without doing anything specific). Better to skip than to clutter domain files with noise.

**Hard rule:** Each destination file gets at most ONE line per session. Multiple lines = noise.

### Step 4c: Append the session episode (episodic ledger)

One call, from the Step 2 distillation (no extra reads):

```bash
bash .claude/hooks/episode-append.sh \
  --task "{the Step 2 Task line}" \
  --outcome {success|partial|fail} \
  --domain "{the primary domain this session touched}" \
  --files "{comma-separated paths from the Files list}" \
  --decision "{the top Decisions line, or empty}" \
  --lesson "{one line if a learning was nominated, else omit}"
```

Outcome maps from Remaining: empty Remaining = `success`, real Remaining = `partial`, session stalled = `fail`. The script appends one line to `memory/episodes/YYYY-MM.jsonl`, refreshes the 20-line `INDEX.md`, and never fails this command. `/recall` queries it later via grep only.

### Step 5: Nominate learnings (only if discovered)

All learnings route through `.claude/knowledge-nominations.md`. `knowledge-base.md` is auditor-owned: only the auditor writes it, after reviewing nominations (the same boundary `/memory-consolidate` and `/wrap-up` respect). Two confidence tiers, one destination:

**Tier 1, FAST-TRACK nominations** (high confidence, the auditor should promote these on its next pass):
- User overrides (the user explicitly corrected something)
- Empirical facts (verified through testing/API/data)
- Platform rules (limits, dimensions, constraints)

Format: `- [MMDDYY] /safe-clear FAST-TRACK: [learning] | Evidence: [source] | Proposed source tag: [Source: User directive MMDDYY]` (or `Empirical MMDDYY`)

**Tier 2, standard nominations** (lower confidence, auditor weighs the evidence):
- Inferred patterns
- Hypotheses needing more evidence

Format: `- [MMDDYY] /safe-clear: [learning] | Evidence: [source]`

**Rule: When in doubt, mark it FAST-TRACK.** The auditor drains nominations every `/wrap-up` (Step 6) and `/audit`, so a fast-tracked rule lands in the knowledge base within a day while keeping the single-writer boundary intact.

### Step 6: Validate the handoff before stopping

Run the validator to catch missing fields, broken file paths, and vague Next actions:

```bash
bash .claude/hooks/validate-handoff.sh
```

If it returns non-zero, the validator wrote errors to stderr. Fix the handoff (edit the daily note's latest Session Handoff section) and re-run. **Do not output the closing message until the validator passes.**

Common fix patterns:
- "missing field: X" → add the field with the right content
- "Files: path does not exist" → remove or correct the path
- "Next: too vague" → make it specific: "Run the test suite, then fix the failing case in src/auth/session.ts:42" not "Continue work"

### Step 7: STOP and report

Once validation passes, output exactly this message and nothing else:

```
State saved to Daily Notes/MMDDYY.md (Session Handoff).
Domain files updated: [list filenames].
Validation: PASSED.
Nothing else is needed. Claude Code compacts on its own when it has to, and work resumes from "Next".
If you want to flush now, run /compact.
```

**DO NOT auto-resume. DO NOT re-read files. DO NOT continue working in the same context.** Auto-resume in-context defeats the entire purpose, it inflates context instead of reducing it.

If this run came from the quality gate rather than from the user, skip the message and go back to finishing the current step.

When compaction happens, whether automatic or from `/compact`, Claude Code replaces older messages with a summary, `post-compact-resume.sh` (SessionStart, source `compact`) adds the handoff and resume instructions, and the new context starts well below its limit. The summary keeps requests and key code, but detail that only lived in the conversation can drop out, which is why the handoff lives on disk.

---

## Why this design

The previous version of this command tried to "auto-resume" by re-reading files at the end. That added 10-20K tokens to an already-strained context. It did the opposite of its name, it INCREASED context burn instead of reducing it.

The fix: separate concerns. `/safe-clear` distills with intent. `/compact` reduces. The hook bridges them.

**Target:** 4-6 tool calls, <20 seconds (down from 5-7). Emergency: 2-3 calls, <10 seconds.
