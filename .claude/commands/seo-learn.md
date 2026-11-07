---
description: "The LEARN pass. Takes day-7 early reads, then grades every prediction that has come due against what really happened. Cheap when nothing is due."
argument-hint: "[--due-only] [--all] [--dry-run] [--geo]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - WebSearch
  - WebFetch
  - Bash(date:*,ls:*,grep:*,head:*,wc:*,jq:*,curl:*)
---

# /seo-learn

**Usage:** `/seo-learn` | `/seo-learn --all` | `/seo-learn --dry-run` | `/seo-learn --geo`

The LEARN pass, the day-7 / day-28 measurement flywheel. The system writes a prediction_record at
the output of every measurable recommendation (the SEO Loop Integrity rule); this command is the
reader: it finds every prediction whose re-check date has arrived, grades it against the ACTUAL
outcome, fills the Calibration table, and promotes repeated learnings into the knowledge pipeline.
Without this pass the closed loop is theatre; a wall of `(pending)` rows teaches nothing.

**This command MEASURES and PROPOSES. It ships nothing, edits no page, and never re-touches a page
whose prediction is still maturing.**

| Flag | What it does |
|---|---|
| `--due-only` | The default. Early reads, then every row whose re-check date has arrived. |
| `--all` | Every `(pending)` row with a real prediction_record, whatever its date. A full reconciliation: it widens the set, it never licenses an invented actual. |
| `--geo` | Limit the chosen set to `geo` family rows. |
| `--dry-run` | Measure and report; write nothing. |

Flags combine, for example `--geo --dry-run`.

---

## Trigger Conditions

- User runs `/seo-learn` explicitly
- A daily or weekly routine (cheap when nothing is due; the command exits after Step 1)
- After `/rank-check` or `/seo-audit` surfaces that predictions have matured
- The auditor flags overdue `(pending)` Calibration rows

---

## The prediction_record schema (the contract this command grades)

Every measurable recommendation, a title/meta rewrite, a schema addition, a content refresh, a new
page, a technical fix, a feature-capture target, writes ONE row into the `## Calibration` table of
`.claude/agent-memory/seo/MEMORY.md` at output time, in this shape:

| Field | Content |
|---|---|
| Date | ship date, YYYY-MM-DD |
| Prediction | `prediction_record: {page/change} | family: {family} | baseline: {the real measured number now} | predicted_outcome: {a falsifiable numeric target or band} | by_date: {YYYY-MM-DD re-check}` |
| Actual | `(pending)` until graded |
| Delta | `(pending)` until graded |
| Direction | `(pending)` until graded |
| Note | context: instrument to read, any honest caveat |

**Families** (each names its measurement instrument): `ctr-rescue` (GSC CTR + position),
`rank-lift` (GSC position), `indexation / new-page` (GSC coverage, then position), `consolidation`
(GSC coverage of the hub, then redirect status of its sources), `serp-feature`
(live SERP capture + GSC CTR), `geo` (the citation scorecard), `technical / cwv` (PSI or
Lighthouse), `authority` (referring-domain count / a live listing).

**The falsifiability rule (hard):** `predicted_outcome` must be a named metric with a numeric
baseline and a numeric predicted value or band, decidable true or false at the re-check date from
the instrument alone. A caveat may EXPLAIN a possible miss (e.g. "gains are authority-gated"), but
it can never be written so a flat result grades `accurate`. A hedge-only record is invalid; rewrite
it before ship. Honest `by_date` values: CWV re-measures in days; rank/CTR/crawl effects take
weeks: a day-7 early read that informs, then a day-28 verdict that grades.

**Direction vocabulary (the only four values):** `accurate` | `over-optimistic` |
`under-optimistic` | `insufficient-data`.

---

## Procedure

### Step 1: Load the table and select the DUE set

1. `date '+%Y-%m-%d'` for TODAY.
2. Read `.claude/agent-memory/seo/MEMORY.md` `## Calibration`. For every row still `(pending)`,
   parse its `by_date`.
3. Build the DUE set: default = every `(pending)` row with `by_date` on or before today.
   `--all` = every `(pending)` row with a real prediction_record, regardless of date (a full
   reconciliation; it widens the set but never licenses an invented actual).
4. Build the EARLY set: every `(pending)` row where Date + 7 days is on or before today, `by_date` is
   in the future, the Note has no `day-7 read` yet, and the family is `ctr-rescue`, `indexation`,
   `new-page`, `consolidation` or `technical`. These families can show an early signal. The others
   wait for their verdict.
5. With `--geo`, keep only `geo` rows in both sets.
6. **The cheap exit:** if both sets are empty, report one line, "no matured predictions, next due
   {earliest future by_date + what it covers}", and STOP. This is the normal outcome most days and
   must cost near nothing.
7. Guard G1 (no learning without a prior prediction): a shipped change found in the Audit History
   with NO matching prediction_record is reported as `INSUFFICIENT_PRECONDITION`, named, never
   retro-graded with an after-the-fact baseline.

### Step 2: Take the day-7 early reads

For each EARLY row, read the family's instrument and append this to the Note, and nothing else:

`day-7 read {date}: re-crawled {yes|no|unknown}, {metric} {value} ({source})`

An early read tells you whether the change is on track. It is not a grade:

- It never fills Actual, Delta or Direction.
- It never counts toward a hypothesis.
- It is never a reason to edit the page. The page stays locked until its verdict.
- If the page has not been re-crawled, add `re-crawl pending` to the Note and list it under Flags, so
  a page nothing re-crawled is not discovered only at day 28.

If the instrument is unavailable, append `day-7 read {date}: skipped, no instrument` to the Note, so the
next run does not try again, and report it in one line. Do not ask the user to paste numbers for an
early read: that effort belongs to the verdict.

### Step 3: Choose who grades

If the DUE set is empty, go to Step 8.

If `.claude/agents/seo-analyst.md` exists, `site.domain` is filled in `seo-engine/CONFIG.md`, and
`.claude/agent-memory/seo/STRATEGY.md` and `GEO-STRATEGY.md` exist, spawn `seo-analyst` through the
Agent tool, synchronously, with today's date, the DUE set, the flags, and the path to
`seo-engine/CALIBRATION-TABLE.md`. It runs Steps 4 to 6 in a fresh context and returns its report,
including any `PROPOSE_*` tags. Then go to Step 7. Fresh context matters: the session that shipped a
change should not grade it.

Otherwise the engine is not set up yet, so run Steps 4 to 6 yourself, and tag the report
`graded inline, seo-analyst not set up`. This keeps grading available from your first prediction.

### Step 4: Measure the ACTUAL per due row (real instruments only)

Match the instrument to the family. State the source of every number.

**With GSC access (preferred, from CLAUDE.local.md):**
- `ctr-rescue` / `rank-lift`: pull the page's GSC CTR + average position for the post-ship window
  and the like-for-like pre-ship window. Exclude machine queries (drop queries containing `site:`
  or bracketed operator patterns). The clock starts at the page's RE-CRAWL, not its deploy; a page
  never re-crawled in the window is `insufficient-data` with that reason.
- `indexation / new-page`: GSC coverage (indexed by the index-by date?), then position.
- `consolidation`: GSC coverage for the hub, then the redirect status of its sources. The clock
  starts at the hub's first verified crawl. Never crawled by the hard stop is `insufficient-data`.
- `technical / cwv`: PSI API or local Lighthouse against the live URL, same method as the baseline.
- `serp-feature`: check the live SERP for the capture (binary) plus the GSC CTR delta.
- `geo`: the latest citation scorecard (`.claude/agent-memory/seo/geo-scorecard-*.md`), or run the
  scorecard procedure from the geo-mastery doctrine skill if stale.
- `authority`: referring-domain pull or a live check of the specific listing/PR.

**Without GSC access (manual paste fallback):** list the due rows and the exact numbers needed
("for /blog/x: GSC CTR + avg position, last 28 days vs prior 28, page filter"), ask the user to
paste them from the GSC UI, and grade from the pasted values. Label the source `manual GSC paste`.

**If the instrument is unavailable** (no GSC, quota walls, no paste): mark the row
`deferred, instrument unavailable` and leave it `(pending)`. **Deferred is honest;
`insufficient-data` means measured-and-unreadable; a fabricated actual is the one thing this pass
must never produce.**

### Step 5: Grade and fill the table IN PLACE

Do this as one unit. Finish every row you measured, the health numbers and the Audit History line in
the same pass, so the table is never left half graded.

Grade position against your rank tracker and the row filtered to the target query, never a page-level
average over a window: a page's average moves whenever its mix of queries moves.

If a row changed two things, attribute them separately before you credit either: a title usually moves
CTR, and depth or links usually move position. Write the split in the Note.

For each measured row, edit its Calibration entry:
- **Actual**: the measured outcome + the source + the graded-on date.
- **Delta**: actual minus target, signed, in the metric's own units (pp for CTR, positions for rank, page count for
  coverage, cited-count for GEO, domains for authority).
- **Direction**: one of the four values. Meeting the target grades `accurate`; beating it by more
  than the minimum-effect band in `seo-engine/CALIBRATION-TABLE.md` grades `under-optimistic`. A gain
  over baseline inside that band is NEUTRAL: grade `insufficient-data`. A flat result against a falsifiable target grades
  `over-optimistic` (or `insufficient-data` if unreadable); the authority-gated caveat may EXPLAIN
  the miss in the note, never convert it to `accurate`.
- **CONFOUNDED**: if the page was re-touched mid-window (a lock-list breach), grade the row
  CONFOUNDED in the note, exclude it from pattern counts, and flag the breach.
- A page that needed a re-index nothing delivered gets an explicit open item in the Note, naming the
  next action, so it is not lost.
- Touch NO future-dated `(pending)` row (grading an open window is a breach; an early read is the one
  Note-only exception) and no other MEMORY section except an Audit History line for this pass and the
  Benchmark Snapshots row in Step 7.

### Step 6: Promote repeated learnings (gated at n >= 3)

- Track hypotheses across passes ("FAQ blocks lift CTR on commercial pages", "title rewrites alone
  do not move authority-gated terms"). Recount them from the graded rows each pass, by family and
  lever, so nothing extra is stored. One graded row can OPEN or INCREMENT a hypothesis, never close it.
- When a hypothesis is CONFIRMED or REFUTED at **n >= 3** graded rows with a consistent direction
  and a real effect, append a nomination to `.claude/knowledge-nominations.md`:
  `- [MMDDYY] seo-learn: {the confirmed lever + direction + effect} | Evidence: {the n graded rows}`.
  The auditor promotes; this command never writes `knowledge-base.md` directly.
- A STRATEGY or GEO-STRATEGY change at n >= 3 is proposed with a `PROPOSE_STRATEGY` or
  `PROPOSE_GEO_STRATEGY` tag in the report, and an agent-attributable pattern with
  `PROPOSE_AGENT_REVISION`, for `/engine-tune`. Nothing is applied here.
- Below n=3: report "still OPEN at n={n}", promote nothing. A routine pass with no promotion is
  correct, not a failure.

### Step 7: Record engine health and a benchmark snapshot

1. Update the Calibration health table with this pass's tallies, unless `seo-analyst` already did.
2. Report calibration accuracy and, if `.claude/agent-memory/seo/MEMORY.md` has an Audit Output Log,
   the auditor intervention rate (WARN and FAIL verdicts as a share of ships).
3. On the first pass of each calendar month, append one dated line to a `## Benchmark Snapshots`
   section of `.claude/agent-memory/seo/MEMORY.md`, creating the section if it is absent: total clicks,
   impressions, average position and indexed pages, each with its source. If you have no instrument,
   skip it. The seo-sensor uses these when it has no fresh data.

### Step 8: Report

```markdown
## /seo-learn complete, {date}

### Due set
Pending: {total} | early reads: {e} | graded this pass: {n} | deferred: {d} | next due: {date + pages}

### Early reads (informing, not graded)
- {page/change}: re-crawled {yes|no|unknown}, {metric} {value} ({source})

### Graded (written to Calibration)
- {page/change} ({family}): predicted {target} by {date} -> ACTUAL {measured} ({source}) |
  Delta {signed} | {accurate|over-optimistic|under-optimistic|insufficient-data}
- ...
Split: accurate {a} | over {o} | under {u} | insufficient {i} | confounded {x}

### Learnings
- Promoted (n>=3): {nomination | none, hypotheses still open at n<k}

### Engine health
- Accuracy: {X}% of last {N} graded rows landed accurate (trend {up|flat|down}).
  {If systematically over-optimistic: flag the prediction-writing discipline for re-anchoring.}
- Auditor intervention rate: {Y}% over last {M} ships | not tracked yet.
- Graded by: {seo-analyst | inline, seo-analyst not set up}

### Flags
- {INSUFFICIENT_PRECONDITION ships | lock-list breaches / confounded rows | re-crawl pending pages |
  deferred rows + what is needed to grade them}
```

`--dry-run`: measure and report everything, write nothing (no Calibration edit, no nomination); tag
every planned write `[DRY RUN]`.

## Output

The report above, the graded Calibration rows, any `day-7 read` notes, the health table, and any
nominations. On a day with nothing due, one line.

---

## Boundaries (never violated)

- Never grade a row before its `by_date` (default mode). Never fabricate an actual; defer honestly.
- Never re-touch, or recommend re-touching, a page inside its measurement window.
- Never write knowledge-base.md directly; nominate only.
- Never edit anything except the Calibration rows, the health table, the nominations file, one Audit
  History line, and the monthly Benchmark Snapshots line.
- No em dashes in any output.

## When NOT to run

- Immediately after shipping a change (its window has not opened; let the re-check date arrive).
- To "make the table look complete". The table's job is to be honest, not full.
