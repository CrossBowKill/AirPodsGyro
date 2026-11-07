---
description: Daily memory reconciliation - read-only health report of the memory layer, then archive finished or stale items out of memory.md into a monthly archive, never deleting
argument-hint: "[--report-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash(python3:*, date:*, wc:*, ls:*, mkdir:*)
---

Keeps `.claude/memory.md` a one-page, current summary. Moves finished or stale items into a monthly archive with a pointer. Never deletes. Runs daily (scheduled or at `/start`), and can be run by hand.

`/forget` retires whole memory files and knowledge entries on the decay ledger's TTL, with the user confirming each move. `/memory-reconcile` is the lighter daily pass over the lines inside `memory.md` itself. They share one rule: archive, never delete.

For the first 14 days after install, run with `--report-only`: measure and report, move nothing. Reconcile once you trust the classifications.

## Inputs

- `python3 .claude/scripts/memory-health.py --stale-days 14` (JSON report; exit 0 means OK, exit 2 means something to look at)
- `.claude/memory.md`
- The last 14 files in `Daily Notes/` (newest first) and `Task Board.md`
- `.claude/knowledge-nominations.md` (count only)

## Steps

### Step 1: Measure

Run the health script from the project root. If `status` is `OK`, append one line to today's daily note under `## Memory reconcile` ("OK, nothing to do") and stop.

The report lists, for the watched sections (`Now`, `Open Threads`, `Open Tasks`, `Blockers`, `Known Issues`): `stale_items` (dated older than the window), `undated_items`, `relative_time_words` (TODAY, tomorrow, this week with no date), `over_long_lines`, plus the `memory.md` line and byte counts, the knowledge-base line count against its 200 line cap, old nominations, and oversized agent memories. Pass `--sections` if your `memory.md` uses different headings.

### Step 2: Classify each flagged item

For every item in `stale_items`, `undated_items`, `relative_time_words` and `over_long_lines`, search the recent daily notes and the Task Board for its subject. Classify it as:

- **DONE**: a later note, board entry or tick shows it finished or superseded.
- **LIVE**: a note in the last 14 days shows it is still being worked on or still blocking.
- **UNKNOWN**: no evidence either way.

### Step 3: Act, reversibly (skipped in report-only mode)

Write the archive before editing `memory.md`. If the archive write fails, stop.

- **DONE**: append the item verbatim to `.claude/memory-archive/YYYY-MM.md` (current month) under a `## Archived YYYY-MM-DD` heading. Then remove it from `memory.md`.
- **LIVE**: rewrite it as one line of at most 300 characters: `- [MMDDYY] subject: current state. Detail: <path>`. Move any long detail verbatim into the archive file and point to it, or to a project file that already holds it (an agent `MEMORY.md`, a domain memory file under `memory/`, a handoff). Always add a date if it had none.
- **UNKNOWN**: leave it in place, prefix it with `[check MMDDYY]`, and list it for the user (Step 5).
- Replace every "TODAY", "tomorrow", "this week" with the actual date it referred to, taken from the daily note that wrote it.

### Step 4: Queue checks, do not fix them here

- Knowledge base within 10 lines of its cap: output `RECOMMEND: /audit knowledge: knowledge-base at cap, run a via-negativa pass`.
- More than 10 nominations older than 14 days: output `RECOMMEND: /audit nominations: N nominations waiting more than 14 days`.
- Agent memory over its size limit: output `RECOMMEND: /memory-consolidate <agent>`.

### Step 5: Report

Append to today's daily note under `## Memory reconcile`:
- mode (report-only or live)
- counts: archived, rewritten, unknown (or "would archive / would rewrite" in report-only mode)
- `memory.md` lines and bytes before and after
- the UNKNOWN items as a short numbered list the user can answer with "done" or "live"

## Rules

- Never delete text. Everything removed from `memory.md` lands in the archive first.
- Keep `memory.md` under 100 lines (the completeness gate blocks a Write above that) and under 12,000 bytes.
- Only touch the watched sections. Leave `Recent Decisions` and any customer-added section alone except to add missing dates.
- Do not edit `knowledge-base.md`. Only the auditor writes there.
- If two runs happen on the same day, the second one only measures and reports.
- The script is read-only and standard-library only. If `python3` is missing, say so and stop; do not reconcile from memory.

## Output contract

Three lines to the caller: status (`OK`, `REPORTED` or `RECONCILED`), `memory.md` lines and bytes before and after, number of UNKNOWN items.
