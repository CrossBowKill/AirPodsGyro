---
name: "source-command-seo-watch"
description: "Migrated source command `seo-watch`"
---

# source-command-seo-watch

Use this skill when the user asks to run the migrated source command `seo-watch`.

## Command Template

# /seo-watch

**Usage:** `/seo-watch` | `/seo-watch --dry-run` | `/seo-watch --front=rank|competitor|geo|technical` | `/seo-watch --establish-baseline`

The lightweight daily reactive loop between full audits. It re-senses the fast-moving,
browser-free signals (rank movements from tracked data, indexation and sitemap anomalies, Core Web
Vitals regressions, competitor SERP moves, AI-citation changes), diffs them against the last
baseline, and fires a FOCUSED response only when a precise threshold is crossed. It ARMS and
ALERTS; it never ships, edits content, or deploys.

Deliberately light: no full data pull, no content work, no deploy. Most runs end with a clean
"no trigger" report, and that restraint is the design. Runs cleanly unattended (cron/scheduled)
with no browser.

---

## Trigger Conditions

- User runs `/seo-watch` explicitly
- A daily scheduled slot, offset from any full audit routine
- Off-cadence on a known event: a deploy just landed, a listing went live, the user asks for a fast
  reactive read

---

## Step 0: Config (first run creates it)

Read `.Codex/seo-config.yml`. If it does not exist, create it by asking the user (or by lifting
answers from `seo-engine/CONFIG.md` and `Codex.local.md` where already filled in), then write:

```yaml
# .Codex/seo-config.yml , created by /seo-watch on first run, edited freely by the user
domain: mysite.com                 # apex, no protocol
gsc_property: https://mysite.com/  # GSC property URL, or "none"
key_pages:                         # 2-4 pages for CWV + health checks
  - /
  - /pricing
priority_queries:                  # the money queries to watch (5-8)
  - example query one
  - example query two
competitors:                       # 2-3 domains to watch for overtakes
  - competitor1.com
brand: MyBrand                     # for citation probes
```

Every subsequent run reads this file; never hardcode a domain, query, or competitor in this
command's logic.

## Step 1: Pre-flight and baseline

1. `date '+%Y-%m-%d %H:%M'`.
2. Locate the baseline this run diffs against, newest of each:
   - Rank data: the keyword maps at `.Codex/agent-memory/seo/keyword-maps/{domain-slug}.md` and
     any dated rank snapshots.
   - Watch baseline: `.Codex/agent-memory/seo/watch-baseline.md` (this command's own snapshot:
     sitemap URL count, CWV bands per key page, top-3 holders per priority query, citation status
     per query).
   - Citation data: the newest `.Codex/agent-memory/seo/geo-scorecard-*.md` if present.
3. **The baseline rule:** if no baseline exists (first run), behave as `--establish-baseline`:
   sense everything, write `watch-baseline.md`, detect NO triggers, report `baseline set`. A first
   run never fires off an empty comparison.
4. `--dry-run`: run every sense and diff, print what WOULD fire, write and dispatch nothing.

## Step 2: SENSE (fast, browser-free signals only; `--front=` restricts to one)

### 2.1 Rank watch (front: rank)
Diff the tracked keywords' current recorded positions against the prior recording (the keyword map
history / last `/rank-check` data). If no new rank data exists since the last watch run, record
"rank data not refreshed, no rank read this run" and do NOT fire; optionally spot-check the top 3-5
priority queries via WebSearch, labeling results "manual SERP check, approximate", corroboration
only, never reported as a tracked rank.

### 2.2 Technical watch (front: technical)
```bash
# Sitemap reachability + URL count (a collapse or non-200 is the anomaly)
curl -s -o /dev/null -w "sitemap HTTP %{http_code}\n" "https://{domain}/sitemap.xml"
curl -s "https://{domain}/sitemap.xml" | grep -c "<loc>"
# Soft-404 spot check (should be 404)
curl -s -o /dev/null -w "junk-path HTTP %{http_code}\n" "https://{domain}/does-not-exist-xyz"
# Core Web Vitals per key page (keyless PSI API, mobile)
curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2F{domain}{page}&strategy=mobile&category=performance"
```
Extract perf score, LCP, CLS from the PSI JSON. If PSI errors or rate-limits, carry the baseline
numbers marked `(carried, PSI unavailable)`; never fabricate a CWV number.

### 2.3 Competitor watch (front: competitor)
For each priority query, pull the live top results (WebSearch/WebFetch). Record the named top-3
holders and diff against the baseline holders. Movement only: an overtake, a new entrant, an
incumbent closing an axis you were exploiting (added schema, refreshed a stale page).

### 2.4 Citation watch (front: geo)
Probe the priority queries plus the brand probes ("what is {brand}", "{brand} review") via
WebSearch as the retrieval proxy. Per query record cited / not-cited / unverified and who IS
surfaced, and diff against the last scorecard or baseline. The standing caveat: a PERSISTENTLY flat
"not cited" is the authority limiter, expected, NOT a trigger; only a CHANGE is. Also count the
independent mentions of the brand that the brand probes return, and store the count in the baseline.

## Step 3: DETECT (precise thresholds; noise never fires)

| # | Trigger | Threshold (vs baseline) | Response |
|---|---|---|---|
| 1 | Rank drop on a tracked money term | 3+ position drop, a top-20 exit, or a top-10 exit, from real tracked data (both readings real) | Investigate via `/rank-check` investigation mode |
| 2 | Competitor overtake / new entrant | A confirmed rank-order flip on a priority query (named URL), or a new top-3 holder not in the baseline top-5, or a confirmed axis-close | `/competitor-seo {domain}` teardown |
| 3 | Citation change | A confirmed status flip cited -> not-cited (defensive) or not-cited -> cited (capture + reinforce) on a priority query, corroborated by two checks, never one blank pull | `/ai-visibility {domain}` + geo-mastery doctrine |
| 4 | Sitemap / indexation anomaly | Sitemap non-200, a material URL-count drop, or the junk path returning 200 (soft-404 regression) | Technical fix via the technical-seo-mastery doctrine |
| 5 | CWV regression | A key page's LCP or CLS crossing a band boundary the wrong way, confirmed by a REAL PSI reading (never a carried one) | `/seo-audit {page}` technical pass |
| 6 | Mention step change | The independent mention count moves by 3 or more against the baseline, in either direction, with the named pages listed | `/geo-cycle` |

Honesty gates: a low-confidence, proxy-only, or unverified read fires NOTHING and says so. A first
reading with no baseline fires nothing. Run-to-run jitter is not a trigger. Web search is a proxy,
so a competitor or citation change read that way counts only once it is corroborated: fetch the
named page and confirm it, or get the same result from a second search worded differently in the
same run. One uncorroborated pull fires nothing.

## Step 4: DISPATCH (arm and alert; never ship)

For each fired trigger:
1. **RECOMMEND (default):** emit `RECOMMEND: /{command} {args}, {the specific trigger + evidence}`
   as the report's actionable headline. This command launches nothing destructive and ships
   nothing; the recommended command owns its own procedure and gates.
2. **Append the alert** to `.Codex/agent-memory/seo/watch-log.md` (create with a short header if
   absent): timestamp, trigger type, what crossed the threshold, the evidence (numbers vs baseline
   date, named URLs), the recommended command.

**Write policy (via negativa): a watch-log entry is written ONLY on a fired trigger, or as ONE
weekly heartbeat line (the first run of each week logs "heartbeat: no trigger, ranks/citations/
health held"). A daily no-trigger run writes nothing to disk** and only returns its all-quiet
report. Never fabricate a trigger to fill the log.

Do NOT write a prediction_record here: this loop senses and triggers, it ships no measurable
change. Whatever command it recommends writes its own records when it acts.

## Step 5: Advance the baseline and report

Update `.Codex/agent-memory/seo/watch-baseline.md` with this run's sensed values (sitemap count,
CWV bands, top-3 holders, citation statuses) so the next run diffs against it. On
`--establish-baseline` this is the whole job.

```markdown
## /seo-watch complete, {date time} [front: {all|...}]

### Baseline diffed against
{watch-baseline date | BASELINE SET, no prior snapshot}

### Triggers
- Rank: {NONE | {term} dropped {X -> Y}}
- Competitor: {NONE | {domain} overtook us on "{query}" | new entrant {domain}}
- Citation: {NONE | LOST/GAINED on "{query}"} | Mentions: {NONE | {old} -> {new}}
- Technical: {NONE | sitemap {issue} | CWV regression on {page} ({band -> band})}

### Dispatch
{per trigger: RECOMMEND /{command}, one-line reason | "No dispatch, all quiet. Ranks, citations,
and health held vs baseline."}

### Sense coverage (stated every run)
- Rank: {diffed tracked data | not refreshed, no read} | GSC-dependent signals (indexation counts,
  CTR leaks): {checked | need GSC access or the next full audit, deferred}
```

---

## Boundaries

- SENSES + DETECTS + ALERTS + RECOMMENDS. Never ships: no content edit, no schema change, no
  deploy, no submission, no email.
- Never re-touches, or recommends re-touching, a page with a maturing prediction_record (check the
  Calibration table before recommending action on a page; a trigger on a mid-window page is noted
  and held).
- Honest about coverage every run: what was checked, what was deferred, and why. A proxy SERP
  position is corroboration, never reported as a tracked rank.
- Not a second full audit. Light reactive senses only; the full pull belongs to `/seo-audit` and
  `/rank-check`.

## When NOT to run

- Immediately after a full audit with no intervening event (it re-confirms the same baseline).
- More than the daily slot plus real events (repeat runs re-print the same trend line).
- When the site is already known down (that is an incident, not a watch trigger).
- For a GSC-indexation or CTR-leak question specifically (those need the GSC data a full pass
  owns).
