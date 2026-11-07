---
description: Governed forgetting - review the staleness scan with the user and archive confirmed-stale memory to the attic (reversible, never deletes)
argument-hint: ""
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash(date:*)
  - Bash(bash:*)
  - Bash(mkdir:*)
  - Bash(mv:*)
  - Bash(cp:*)
  - Bash(wc:*)
  - Bash(grep:*)
  - Bash(cat:*)
---

Retire stale memory on purpose (memory tier 8, the decay ledger). Stale facts are not deleted, they are moved to `memory/attic/` with a dated header, fully reversible. This is what keeps the always-loaded memory surfaces sharp: context stays clean because facts that stopped being true stop being loaded.

**Hard rules:**
- **Archive, never delete.** Every removal lands in `memory/attic/` first. Restoring is a copy-back.
- **User confirms every move.** The scanner proposes; the user disposes. No move without an explicit yes on that specific item.
- **`knowledge-base.md` is auditor-owned.** This command never edits it directly. Stale knowledge-base entries are FLAGGED via `.claude/knowledge-nominations.md` for the auditor to retire (the same single-writer boundary `/memory-consolidate` respects).

## Steps

### Step 1: Get a fresh scan

```bash
bash .claude/hooks/staleness-scan.sh
```

The scanner is read-only. It compares every file registered in `memory/.staleness.json` (its `ttl_class`: permanent, 90d, or 14d) against file mtime and dated `[MMDDYY]` entry stamps, and writes its report to `.claude/logs/.staleness-report.md`. If it reports zero candidates, tell the user memory is clean and stop.

### Step 2: Check the line caps too

Beyond TTL, two shipped caps matter:

```bash
wc -l .claude/memory.md .claude/knowledge-base.md 2>/dev/null
```

- `.claude/memory.md` over (or near) **100 lines**: propose the oldest resolved threads and completed items as attic candidates.
- `.claude/knowledge-base.md` over (or near) **200 lines**: propose the least-load-bearing entries as candidates, but route them through Step 5 (nomination), never edit the file here.

### Step 3: Review candidates with the user

Present the combined candidate list (TTL-stale files, stale dated entries, cap-pressure items) as a numbered list with, for each: what it is, why it is flagged (age vs TTL, or cap pressure), and what the move would look like. Ask the user to confirm, reject, or mark keep-forever per item.

- **Keep-forever**: set that file's `ttl_class` to `permanent` in `memory/.staleness.json` so it is never flagged again.
- **Reject**: do nothing; it will be re-flagged next scan unless it gets touched.

### Step 4: Archive confirmed items

For a confirmed **whole file** (for example a domain memory file for a finished project):

```bash
mv "memory/{file}.md" "memory/attic/{file}.md"
```

Then prepend a dated header to the attic copy:

```markdown
> ARCHIVED [MMDDYY] by /forget. Reason: {one line}. Restore: move this file back to its original path and re-register it in memory/.staleness.json.
```

For confirmed **individual entries** inside a still-active file (memory.md sections, old dated lines in a domain file): cut the confirmed lines from the source file and append them to `memory/attic/{source-basename}-attic.md` under a dated `## Archived [MMDDYY]` heading, with one line naming the source file. The source file keeps everything unconfirmed.

After moves, update `memory/.staleness.json`: remove entries for files that moved to the attic (or re-point them if renamed). The attic itself is never scanned.

### Step 5: Flag knowledge-base candidates (auditor-owned path)

For each confirmed-stale knowledge-base entry, append a nomination instead of editing:

```markdown
- [MMDDYY] /forget: retire knowledge-base entry "{first words of the entry}", stale per decay ledger | Evidence: staleness scan MMDDYY, entry stamp older than TTL
```

The auditor drains nominations at `/wrap-up` and `/sync` and performs the actual retirement under its 200-line curation duty.

### Step 6: Report

Summarize: N candidates reviewed, M archived (list attic destinations), K kept-forever (ledger updated), J flagged to the auditor. Remind the user that every move is reversible from `memory/attic/`.

## Why this design

Most memory systems only accumulate; this one retires. Facts age at different speeds (a scratchpad note is stale in two weeks, a learned platform rule may never be), so the decay ledger assigns a TTL class per surface and a deterministic scanner does the noticing. The human stays in the loop for every move, and the attic makes wrong calls free to undo. Context stays sharp because stale facts are retired, not accumulated.
