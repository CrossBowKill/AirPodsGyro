---
description: "The SEO/GEO Engine spine. Runs the full five-phase loop (SENSE -> DECIDE -> ACT -> VERIFY -> LEARN) over ONE shared sensor pull: parallel sense agents -> the strategist's cycle brief -> the gated ACT work (on-page-engineer + technical-engineer + authority-engine) -> the fresh-context seo-engine-auditor as the no-slop gate + prediction_records. Default cadence: the full-cycle days in seo-engine/CONFIG.md, with /seo-watch daily between them. Governed by STRATEGY.md + GEO-STRATEGY.md."
argument-hint: "[--sense-only] [--geo] [--dry-run] [--front=keyword|technical|geo|authority]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(date:*,cd:*,git:*,curl:*,bash:*,ls:*,grep:*,node:*,npm:*,pnpm:*,wc:*,find:*)
  - Glob
  - Grep
  - Agent
  - WebSearch
  - WebFetch
---

# /seo-engine

The orchestrator spine of the SEO/GEO Engine. One command runs the whole machine: it senses the
cycle's truth once, decides with via-negativa discipline, executes the authorised work through the
dedicated executor agents, fires the fresh-context auditor as the no-slop gate, and leaves
prediction_records behind so the next cycle is sharper. You wake up to shipped improvements plus a
brief. You steer; you do not operate.

**Mandatory reads before running (in this order):**
1. `seo-engine/CONFIG.md`: every site-specific value the cycle uses.
2. `seo-engine/README.md`: the five phases, the seven laws, the hard constraints.
3. `.claude/agent-memory/seo/STRATEGY.md`: the Google governance (tiers, gates, harvest beats plant).
4. `.claude/agent-memory/seo/GEO-STRATEGY.md`: the AI-engine governance.
If either governance file is missing, stop and point the user at the templates in `seo-engine/`.

## The loop

```
[0 SENSE] -> [1 DECIDE] -> [2 ACT] -> [3 VERIFY]      (LEARN is fired separately by /seo-learn)
 seo-sensor   strategist    on-page +    seo-engine-auditor
 + 3 sense    cycle brief   technical +  (fresh context, can BLOCK)
 agents                     authority    + prediction_records
```

One shared sensor pull feeds every SENSE agent. The strategist writes the brief. ACT executes only
what the brief authorises. VERIFY can block. LEARN runs on its own schedule.

## Roster

Every phase invokes its real agent via the Agent tool, synchronously (`run_in_background: false`)
when the next step reviews its output. Before invoking, confirm `.claude/agents/{agent}.md` exists.
An inline fallback is a safety net for a genuinely absent file only; tag any such output
`[inline fallback, {agent} file absent]` and never self-verify a phase whose agent is on disk.

## Flags

| Flag | Effect |
|---|---|
| `--sense-only` | Phase 0 only: the snapshot, the queue, the intel, the scorecard, the integrity gate, then STOP. A fast morning read. |
| `--geo` | Bias the cycle to the GEO front: the strategist prioritises the scorecard gaps; ACT runs only the GEO on-page wave. |
| `--front=keyword\|technical\|geo\|authority` | Constrain DECIDE and ACT to one front. `authority` arms off-page moves only; it never deploys. |
| `--dry-run` | Every step except the deploy and any indexing request. Produce the brief, the planned edits, and the would-be prediction_records tagged `[DRY RUN]`; write nothing to the remote and request nothing. |

Flags compose. `--sense-only` overrides ACT and VERIFY.

---

## Phase 0, SENSE (gather truth once, feed everyone)

### 0.1 Pre-flight (under 30 seconds)
```bash
date +"%Y-%m-%d"
for a in seo-sensor seo-opportunity-miner competitor-sentinel geo-citation-engine seo-strategist on-page-engineer technical-engineer authority-engine seo-engine-auditor seo-analyst; do
  [ -f ".claude/agents/$a.md" ] && echo "present: $a" || echo "ABSENT: $a (inline fallback, flag it)"
done
ls .claude/agent-memory/seo/STRATEGY.md .claude/agent-memory/seo/GEO-STRATEGY.md
cat .claude/agent-memory/seo/indexing-queue.md 2>/dev/null | head -20
```
Read `search_console.access` from CONFIG. If it is `browser`, the operator's logged-in browser
session is used only for Phase 2 indexing requests and the sitemap resubmit; no data read depends
on it. If it is `api`, the configured command serves both reads and submissions. If `none`, the
engine still runs; Search Console blocks are carried stale and submissions are flagged for the
operator.

### 0.2 The shared pull (once, via seo-sensor)
**Invoke `seo-sensor`.** It writes `.claude/agent-memory/seo/sensor-snapshot-{date}.md` (Search
Console pages and queries with the exclusion applied, rank truth, indexation, Core Web Vitals,
sitemap status, the priority-query SERPs) and returns the path plus a freshness line. Do not perform
a separate orchestrator pull; that creates a second artefact and pulls twice.

### 0.3 SENSE agents (parallel, off the one snapshot)
Dispatch in ONE message, three Agent calls, each handed the snapshot path:
- **seo-opportunity-miner** -> `.claude/agent-memory/seo/opportunity-queue.md`
- **competitor-sentinel** -> `.claude/agent-memory/seo/competitor-intel-{date}.md` (+ the pointer)
- **geo-citation-engine** -> `.claude/agent-memory/seo/geo-scorecard-{date}.md`
If `--front=` constrains the cycle, run only the agents that feed that front. If `--sense-only`,
run 0.4, summarise the queue and the scorecard, and STOP.

### 0.4 Run-integrity gate (mandatory before DECIDE)
An unattended run has no human to notice a truncated or day-stale artefact. Assert every expected
artefact exists, is non-empty, and was regenerated today:
```bash
TODAY=$(date +"%Y-%m-%d"); OK=1
check_fresh () {
  if [ ! -s "$2" ]; then echo "STALE/MISSING: $1 ($2)"; OK=0
  elif [ -n "$(find "$2" -newermt "$TODAY 00:00:00" 2>/dev/null)" ]; then echo "FRESH: $1"
  else echo "STALE: $1, last modified $(date -r "$2" +%F 2>/dev/null) ($2)"; OK=0; fi
}
check_fresh "sensor snapshot"   ".claude/agent-memory/seo/sensor-snapshot-$TODAY.md"
check_fresh "opportunity queue" ".claude/agent-memory/seo/opportunity-queue.md"
check_fresh "competitor intel"  ".claude/agent-memory/seo/competitor-intel-$TODAY.md"
check_fresh "geo scorecard"     ".claude/agent-memory/seo/geo-scorecard-$TODAY.md"
[ "$OK" = 1 ] && echo "INTEGRITY: all fresh" || echo "INTEGRITY: DEGRADED"
```
For every STALE or MISSING artefact: mark that front DEGRADED, name it in the report under
`RUN-INTEGRITY`, append a dated alert to `.claude/agent-memory/seo/watch-log.md` on a scheduled run,
and if the sensor snapshot itself is stale, re-invoke seo-sensor once, then HALT before DECIDE if it
is still stale. Never report success for a front whose input never regenerated.

---

## Phase 1, DECIDE (the strategist writes the cycle brief)

**Invoke `seo-strategist`** with the four SENSE paths, the integrity verdict (which fronts are
DEGRADED), and the flags. It writes `.claude/agent-memory/seo/cycle-brief.md` with: the LOCK LIST,
HARVEST targets, the gated BUILD decision, GEO moves, TECHNICAL fixes, exactly one AUTHORITY move,
the SKIP list, and the handoff. Read `decision:` from the brief. On `halt`, report the reason and
stop.

At most one exploration item per cycle may enter outside the ranked queue, through the same
prediction gate as everything else.

If `--dry-run` or `--front=authority`: produce the brief and stop before any deploy (the authority
front arms off-page assets only).

---

## Phase 2, ACT (gated, surgical, via the executor agents)

Execute ONLY what the brief authorises. HARVEST before PLANT. If on-page and technical work both run,
they share the working tree: serialise the deploy so only one push happens at a time.

### 2.1 Invoke `on-page-engineer`
Hand it the brief's on-page section. It ships CTR rescue, rank-lift, schema in content, the GEO
on-page wave, and any gated BUILD the brief named; re-checks the LOCK LIST before touching any page;
writes a prediction_record per measurable change; and owns its own deploy through the configured
commands (CONFIG `build_and_deploy`).

### 2.2 Invoke `technical-engineer` (if the brief lists technical items)
Hand it the brief's technical section. It ships the measured fixes, treats load-bearing changes
(routing, build pipeline, rendering) with the ten-step audit or flags them for the operator, and
owns its own deploy and before/after measurement.

### 2.3 Indexing requests (the quota drain)
Read `.claude/agent-memory/seo/indexing-queue.md`. Submit the oldest pending URLs, up to
`search_console.request_indexing_quota_per_day`, via your browser session (the operator's logged-in
Search Console) or the Search Console API, whichever `search_console.access` names. Verify the
inspected URL matches before requesting; mark each submitted URL with the date; roll the overflow
forward. If access is `none`, list the URLs as a one-line operator action. Never fabricate a
submission.

### 2.4 Invoke `authority-engine`
Hand it the brief's authority section. It maintains the fire-pack, tracks the pipeline, and
surfaces THE ONE move for the operator to fire. It arms; it never submits. Confirm it returned a
written tracker; re-invoke once on a missing return.

### 2.5 The deploy discipline (inherited by every executor, non-negotiable)
1. `integrity_command` passes. If it is empty, follow `.claude/commands/site-integrity.md` with `--changed-only`; any FAIL stops the deploy. If `health_check_command` is set, run it now too: a site that is already failing stops here, so a later failure is never blamed on this deploy.
2. `build_command` (if set) succeeds. A red build is never deployed.
3. Surgical staging by exact path; `git diff --cached --name-only` shows nothing under
   `protected_paths`.
4. `git fetch`; check `origin/{branch}..HEAD` for commits you did not make, and `HEAD..origin/{branch}` for commits you do not have yet. Bring those in first, so you never deploy an old tree.
5. Explicit-pathspec commit, heredoc message, zero em dashes.
6. Deploy via `deploy_command` only.
7. Post-deploy: wait `post_deploy_wait_seconds`; `health_check_command` (if set); changed URLs 200;
   the change visible in served HTML. Regression: revert, redeploy, report.
8. Sitemap resubmit via browser session or API if `resubmit_sitemap_after_deploy` is true; else
   flag it.
If `--dry-run`: run steps 1-2 only, print the planned staging, commit, and prediction_records, and
STOP before any push or request.

---

## Phase 3, VERIFY (the fresh-context auditor is the gate)

**Invoke `seo-engine-auditor`** in mode BOTH with the brief, the list of shipped changes (paths and
commit), and the LOCK LIST. It checks pre-ship logic (claims real, lock list, hard rules, via
negativa, falsifiable prediction_records) and post-ship proof (deploy discipline, live
verification, regression, sitemap and indexing, logging), writes the complete verdict to
`.claude/agent-memory/seo/audit-verdict-{date}.md`, writes any missing prediction_record from the
as-shipped evidence, and returns a short pointer. Read the verdict file; it is the source of truth.

**On a BLOCKING FAIL or INCIDENT:** do not promote the change; apply the fix list through the owning
executor; if a shipped change regressed the site, revert (`git revert HEAD`, then redeploy through
the gate). Never silently proceed past a FAIL.

---

## Phase 4, LEARN (fired separately by /seo-learn)

Not run inline. `/seo-learn` fires `seo-analyst` when prediction_records reach their re-check date,
grades them, fills Calibration, nominates learnings, proposes strategy revisions, and files
agent-revision proposals for `/engine-tune`. This command's job is to leave clean, falsifiable
records for it. Report the nearest re-check date.

---

## Phase 5, Memory and report

### 5.1 Memory
- `indexing-queue.md`: mark submitted URLs, recompute pending, archive rows older than 7 days.
- The Calibration rows and Audit Output Log rows were written by the executors and the auditor;
  confirm they exist.
- The dated scorecard and intel are summarised in the report, not copied.

### 5.2 Report
```markdown
## /seo-engine cycle complete, {date}  [flags: {flags}]

### 0 SENSE
- Snapshot: {pages} pages, {queries} queries, mode {API | BROWSER | DEGRADED}.
- Opportunity queue top items: {ranked list}.
- Competitor intel: {top threat, top steal}.
- Citation scorecard: {cited / not per priority query}.
- RUN-INTEGRITY: {all fresh | DEGRADED: {artefact/front}}.

### 1 DECIDE
- Brief: HARVEST {n}, BUILD {target | skipped by gate + reason}, GEO {n}, TECHNICAL {n}, AUTHORITY {move}.
- SKIP list: {items + rules; locked pages held}.

### 2 ACT
- On-page: {changes, before numbers}. Technical: {changes, before/after}. Indexing: {n of quota | flagged}.
- Deploy: commit {hash}, integrity {pass|n/a}, build {pass|n/a}, deployed via {command}.
- Authority: THE ONE MOVE for the operator: {move}.

### 3 VERIFY
- Auditor verdict: {PASS | WARN | FAIL | BLOCKING-FAIL | INCIDENT} | file: {path}.
- Live checks: {URLs + codes} | sitemap resubmit {done | flagged}.
- prediction_records written: {n} (re-check {dates}).

### 4 LEARN
- Fired separately by /seo-learn. Next due: {date}.

### Roster this run
- Agents invoked: {list}. Inline fallback used: {NONE | which}.

### For the operator
- {the authority move to fire} | {load-bearing technical items deferred} | {indexing or sitemap actions if no access} | {any BLOCK or regression} | {any degraded front}.
```

---

## Hard rules (checked at every gate)

1. Zero em dashes anywhere: content, sitemap, commit messages, memory, the brief, the report.
2. Every editorial CTA follows `content.cta_rule`.
3. Surgical staging only; never stage the whole tree or a protected path.
4. Explicit-pathspec commits on a shared working tree.
5. Deploy only through `deploy_command`; integrity and build pass first.
6. Mandatory post-deploy verification; regression means revert.
7. The three gates before any new page; the long-tail firehose is retired.
8. Never re-touch a page with a maturing prediction_record.
9. Every measurable change writes a falsifiable prediction_record at output time.
10. The engine arms the operator for off-page; it never submits, posts, or emails. Load-bearing
    technical changes ship only when proven safe, else they are flagged.

## When NOT to run

- With no monitoring window after a deploy (use `--dry-run` or `--sense-only`).
- When the live site is already failing; confirm health first.
- During a payment or checkout incident on the site.
- With under about 30 minutes of attention for a full cycle; `--sense-only` is the quick read.
