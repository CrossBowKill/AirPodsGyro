---
name: "source-command-seo-cycle"
description: "The gated PLANT path of the SEO/GEO Engine: submit queued URLs for indexing (via your browser session or the Search Console API), build the ONE volume-validated page the strategy authorises, and ship it through one coordinated deploy using your configured commands. Never a daily content firehose; a page that fails the volume, intent, or authority gate is not written."
---

# source-command-seo-cycle

Use this skill when the user asks to run the migrated source command `seo-cycle`.

## Command Template

# /seo-cycle

> **Governed by `.Codex/agent-memory/seo/STRATEGY.md`.** A daily "publish N posts and max the
> indexing quota" firehose is RETIRED by design: it builds a tail of near-zero-volume rankings with a
> low ceiling while the real limiter (authority) goes untouched. `/seo-engine`'s harvest work (convert
> impressions you already earn) is the primary recurring activity. Run `/seo-cycle` only when a
> VOLUME-VALIDATED page is ready to build, at most a few per month, never daily.

One command, the gated plant cycle:
1. Submits queued URLs for indexing, within the daily quota, via your browser session or the API.
2. Writes the ONE page the volume gate cleared (or none, with the reason).
3. Builds and deploys through your configured commands with the full gate.
4. Updates the indexing queue and the SEO memory.
5. Reports, then hands the ship to the auditor.

**Mandatory reads:** `seo-engine/CONFIG.md`, `seo-engine/README.md`,
`.Codex/agent-memory/seo/STRATEGY.md`, `.Codex/agent-memory/seo/MEMORY.md` (`## Calibration` for
the lock list, `## Pending Recommendations`), `.Codex/agent-memory/seo/indexing-queue.md`, and the
`.Codex/skills/seo/doctrine/seo-blog/SKILL.md` doctrine for the page structure.

## Arguments

| Flag | Effect |
|---|---|
| `--skip-indexing` | Skip Phase 1 (use when the quota is known exhausted or access is none) |
| `--skip-build` | Skip Phases 2-3 (submit URLs only) |
| `--dry-run` | Every step except the commit, the deploy, and any indexing request |

## Hard rules (checked at every phase)

1. Zero em dashes in any generated file, sitemap entry, commit message, or memory edit.
2. Every editorial CTA follows `content.cta_rule` in CONFIG.
3. **The volume gate blocks production.** Before writing ANY page: real monthly volume (Search
   Console query data or the configured keyword-volume tool) at or above
   `keyword_volume.minimum_monthly_volume_for_new_page`, OR clear commercial intent, AND a plausible
   conversion path, AND an authority plan if the term is competitive. A keyword that fails is NOT
   written; it becomes a section inside an existing page. If no volume tool is configured and Search
   Console cannot size the term, the decision is "validate, do not build" and the command stops
   before Phase 2 with that line.
4. Never touch a page on the LOCK LIST (a `(pending)` Calibration row with a future by_date).
5. Surgical staging only: stage the new page, the sitemap files, and generated assets by exact path;
   never the whole tree; nothing under `protected_paths`.
6. Deploy only through `build_and_deploy.deploy_command`, after `integrity_command` and
   `build_command` pass.
7. Mandatory post-deploy verification; regression means revert.
8. Indexing idempotency: read the queue first; submitted URLs are removed; on a quota-exceeded
   response, stop Phase 1 cleanly and leave the queue untouched.
9. Every new page writes a prediction_record (family `new-page`: indexed by {date}, then a position
   band by {date}).

---

## Phase 0: Pre-flight

```bash
date +"%Y-%m-%d"
cat .Codex/agent-memory/seo/indexing-queue.md 2>/dev/null || echo "queue absent (create on first submission)"
ls -1 {content.directory} | grep -c "\.md$"
```
Confirm from CONFIG: `search_console.access` (browser, api, none), the quota, the content directory,
the commands. If `--dry-run`, prefix every action `[DRY RUN]` and stop before any mutation (drafts
go to the scratchpad only).

---

## Phase 1: Indexing requests (skip if `--skip-indexing` or access is none)

The quota is `request_indexing_quota_per_day` URLs per rolling window on the property. The window is
stricter than a calendar day: wait a comfortable margin (about 26 hours) after the last successful
drain before probing. Compute hours since the last drain from the memory's submission history; if
under the margin, report when it resets and proceed to Phase 2.

1. Read the queue (`| Date queued | URL | Status |`, oldest pending first). Empty: skip.
2. **Browser session:** open the Search Console URL Inspection page for `search_console.property`
   fresh (a reused tab may still show the last URL with a "request again" control; never click it).
   For each URL: enter it, wait for the inspection result, confirm the displayed URL matches the one
   typed BEFORE requesting indexing, request, wait for the confirmation (it can take 20-30 seconds),
   read the outcome.
   **API:** run `search_console.api_command` in its indexing-request mode for each URL and read the
   response.
3. First URL is the probe: a confirmation means the quota is healthy, continue; a quota-exceeded
   response means stop Phase 1, mark zero submissions, leave the queue untouched; a sign-in or
   challenge screen means stop and ask the operator to re-authenticate (never attempt it yourself).
4. Mark each confirmed URL `submitted: {date}`. If a request fails, retry once, then log it to the
   incident log and move on.

Report: `Submitted X of Y queued. Remaining Z deferred.`

---

## Phase 2: Build the ONE validated page (skip if `--skip-build`)

### 2.1 The gate decision
Read the strategist's latest brief (`.Codex/agent-memory/seo/cycle-brief.md`) if one exists: its
BUILD section names the validated target or says "none this cycle". Standalone, read STRATEGY.md's
Tier-2 target list and the opportunity queue's gap class. State, in writing: the target keyword, the
volume and its source, the intent, the conversion path, the authority plan, and the format that
wins the SERP (table, listicle, comparison, download). If any gate fails, STOP here: "no validated
build; {keyword} routed to validate-first" and skip to Phase 4.

### 2.2 Draft the page
Invoke `on-page-engineer` (synchronously) with the BUILD item, or draft inline when the agent is
absent. Rules: the format that wins the SERP leads; title under `max_title_chars`; description
within `meta_description_chars`; frontmatter per `content.frontmatter_fields`; a direct-answer block
near the top; a 4-5 question FAQ; 3+ inbound internal links woven FROM existing hub pages TO the new
page (verify each resolves); the CTA per `content.cta_rule`; zero em dashes. Write ONE page, save it,
then stop. Add its URL to the sitemap files if `sitemap_in_repo` is set.

### 2.3 Verification gate
```bash
grep -c "$(printf '\342\200\224')" {new page} {sitemap files}      # must be 0
grep -q "{slug}" {sitemap file} && echo "in sitemap" || echo "MISSING IN SITEMAP"
```
Any violation: STOP and fix before building.

---

## Phase 3: Build and deploy

1. `integrity_command` must exit 0. If it is empty, follow `.Codex/commands/site-integrity.md` with `--changed-only`; any FAIL stops the deploy. If `health_check_command` is set, run it now too: a site that is already failing stops here, so a later failure is never blamed on this deploy.
2. `build_command` (if set) must succeed; any error means STOP, surface it, do not deploy.
3. Stage by exact path: the new page, the sitemap files, any generated assets. `git diff --cached
   --name-only` must show only those paths and nothing under `protected_paths`.
4. `git fetch`; check `origin/{branch}..HEAD` for commits you did not make, and `HEAD..origin/{branch}` for commits you do not have yet. Bring those in first, so you never deploy an old tree.
5. Commit with an explicit pathspec and a heredoc message (zero em dashes).
6. Deploy via `deploy_command` exactly as configured.
7. Wait `post_deploy_wait_seconds`; run `health_check_command` if set; `curl -s -o /dev/null -w
   "%{http_code}"` the new URL (200 required) and confirm the title is in the served HTML. Failure:
   revert, redeploy, report.
8. Resubmit the sitemap via browser session or API if configured; otherwise flag it. Queue the new
   URL in `indexing-queue.md` for the next drain.

---

## Phase 4: Memory

- Append a submission-history row to `.Codex/agent-memory/seo/MEMORY.md` (date, submitted URLs or
  "quota exceeded, zero", count, access method, notes).
- Rebuild the queue: rolled-over URLs, the new page, overflow noted.
- Write the new page's prediction_record into `## Calibration` (family `new-page`, author
  on-page-engineer, baseline "not indexed, no position", target "indexed by {+14d}; position band
  {band} by {+28d}", by_date).
- Add an Audit Output Log row for the ship.

---

## Phase 5: Report

```markdown
## /seo-cycle complete, {date}

### Indexing
- Attempted {N}, confirmed {M}, outcome {quota healthy | quota exceeded | re-auth needed | no access, flagged}.

### Build
- Gate: {cleared: {keyword}, {volume + source}, {intent}, {conversion path}, {authority plan} | NOT cleared: validate-first}.
- Page: {slug}, {words}, em dashes 0, inbound links woven {n}.

### Deploy
- Commit {hash}, integrity {pass|n/a}, build {pass|n/a}, deployed via {command}, health {pass|n/a}, URL {code}.
- Sitemap resubmit {done | flagged}. Queued for indexing: {url}.

### Memory
- Submission row appended; queue depth {N}; prediction_record written (re-check {dates}).

### For the operator
- {re-auth | sitemap or indexing actions if no access | nothing}.
```

## Phase 6: Quality gate (mandatory)

Invoke `seo-engine-auditor` in mode POST-SHIP with the commit and the new page. Read its verdict
file. On FAIL or INCIDENT, apply the fix list or revert; never silently proceed.

---

## Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Quota exceeded on the probe | quota-exceeded response | Stop Phase 1, queue intact, continue |
| Sign-in or challenge screen | redirect or challenge | Stop Phase 1, ask the operator to re-authenticate |
| Volume gate not clearable | no volume tool and Search Console cannot size the term | Stop before Phase 2: validate-first |
| Em dash in a generated file | the grep count is non-zero | Fix before build |
| Build fails | non-zero exit | Stop, surface, do not deploy |
| Post-deploy health fails | health command or URL check fails | Revert, redeploy, report |
| No deploy command configured | `deploy_command` empty | Stop after build; list the staged files for the operator |

## When NOT to run

- With no validated target (run `/seo-engine` for harvest instead).
- With no monitoring window after the deploy.
- When the live site is already failing.
- During a payment or checkout incident.

## Maintenance

- Weekly: run `/keyword-research` on your next candidate topics; drop anything off-strategy.
- Monthly: re-pull referring domains; note which pages earned links (the template patterns to repeat).
- Quarterly: audit `.Codex/agent-memory/seo/MEMORY.md` for stale entries; promote verified
  patterns through knowledge nominations.
