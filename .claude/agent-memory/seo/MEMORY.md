# SEO Agent Memory

Persistent knowledge across sessions. Read at startup. Updated after every task.
Curate when file exceeds 200 lines, archive data older than 90 days.

---

## Tool Access Status

| Tool | Status | Last Checked | Notes |
|------|--------|--------------|-------|
| PageSpeed Insights API | Unknown | - | No auth required |
| Google Search Console | Unknown | - | Requires user auth, set in CLAUDE.local.md |
| Ahrefs free tools | Unknown | - | No auth required |
| Screaming Frog CLI | Unknown | - | Check with `which screamingfrog` |
| curl / direct crawl | Available | - | robots.txt, sitemap, headers |

---

## Active Domains

| Domain | Last Audit | Tier | Health Score | Next Due |
|--------|-----------|------|-------------|----------|

---

## Ranking Alerts

| Date | Domain | Keyword | Position Change | Cause | Status |
|------|--------|---------|----------------|-------|--------|

---

## Known Patterns

_(Recurring observations across audits, nominated to knowledge-base when confirmed 2+ times)_

---

## Resolved Patterns

_(Patterns that have been fixed or explained)_

---

## Backlink Opportunities

| Domain | Type | Target URL | Prospect | Status | Added |
|--------|------|-----------|---------|--------|-------|

---

## Audit History

| Date | Domain | Tier | Verdict | Key Findings |
|------|--------|------|---------|-------------|

---

## Competitor Registry

| Domain | Tracked For | DA/DR | Content Cadence | Last Scanned |
|--------|------------|-------|----------------|-------------|

---

## Pending Recommendations

| ID | Domain | Recommendation | Priority | Status | Added | Verified |
|----|--------|---------------|---------|--------|-------|---------|

---

## Audit Output Log

| ID | Date | Domain | Tier | Verdict | Findings | Actionable % | Self-Review Score |
|----|------|--------|------|---------|----------|-------------|------------------|

---

## Calibration

The prediction-vs-actual table that makes the system self-improving. Every measurable
recommendation writes ONE row here at output time (the SEO Loop Integrity rule); `/seo-learn`
grades matured rows at day-7 / day-28 and fills Actual + Delta + Direction. The seo-auditor
verifies a row exists before any measurable change ships, and writes the missing row itself when an
executor forgot.

**Row rules:**
- Prediction format: `prediction_record: {page/change} | family: {ctr-rescue|rank-lift|indexation|serp-feature|geo|technical|authority} | baseline: {real measured number} | predicted_outcome: {falsifiable numeric target or band} | by_date: {YYYY-MM-DD}`
- Falsifiability (hard): the predicted_outcome is decidable true or false at the re-check date from
  the instrument alone. A caveat may explain a possible miss; it can never make a flat result grade
  `accurate`. A hedge-only row is invalid.
- Direction vocabulary: `accurate` | `over-optimistic` | `under-optimistic` | `insufficient-data`.
  An unreachable instrument = `deferred` in the note, row stays `(pending)`; never fabricate an
  actual.
- **LOCK LIST:** every `(pending)` row with a future by_date locks its page. Re-touching a locked
  page corrupts the measurement window; any agent must check this table before editing a page, and
  a breach is graded CONFOUNDED and flagged.
- Honest by_date: CWV re-measures in days; rank/CTR/crawl effects take weeks (+7d first read, +28d
  verdict). The measurement clock starts at the page's re-crawl, not its deploy.

| Date | Prediction | Actual | Delta | Direction | Note |
|------|-----------|--------|-------|-----------|------|

### Calibration health (updated by /seo-learn)

Rolling share of graded rows landing `accurate`. Rising = predictions are getting sharper.
Systematically over-optimistic = re-anchor the prediction-writing discipline, not the grading.

| Pass date | Graded | Accurate | Over | Under | Insufficient | Accuracy % |
|-----------|--------|----------|------|-------|--------------|------------|

---

## What Worked

_(VERIFIED-POSITIVE outcomes, tactics with confirmed positive impact)_

---

## What Didn't Work

_(VERIFIED-NEGATIVE outcomes, tactics tried and disproven with learnings)_
