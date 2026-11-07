---
name: "source-command-geo-cycle"
description: "The GEO sub-loop: citation scorecard + entity signals + extractability audit + a ranked owner-split move list. Tests the priority queries against the AI-answer landscape, scores cited/not versus competitors per engine, tracks the leading indicators, and arms the executors and the operator. Runnable standalone or as the GEO front of /seo-engine. Ships nothing. Governed by GEO-STRATEGY.md."
---

# source-command-geo-cycle

Use this skill when the user asks to run the migrated source command `geo-cycle`.

## Command Template

# /geo-cycle

The GEO half of the SEO/GEO Engine, run as one loop: it tests whether the AI engines cite your brand
for its priority queries, scores who is cited instead and why, tracks the entity signals that
precede citation, audits the on-page extractability of the money pages, and outputs a ranked move
list split into AUTONOMOUS on-page (ship now) versus OPERATOR presence (needs your accounts).

**Governed by `.Codex/agent-memory/seo/GEO-STRATEGY.md` and the
`.Codex/skills/seo/doctrine/geo-mastery/SKILL.md` doctrine; read both first, plus
`seo-engine/CONFIG.md` for the brand, the priority queries, the brand probes, the engines, and the
citation test method.**

## The ground truth this loop starts from

For most sites the GEO technical foundation is cheap and quickly built (llms.txt, direct-answer
blocks, schema, an AI-crawler allowlist), and the limiter is identical to the Google limiter:
authority and presence. If no trusted third-party source has described the brand, engines have only
your own marketing to retrieve, and they discount it. So every run does two things: it queues the
cheap autonomous on-page wins, and it arms the operator for the presence work that is the actual
unlock. It never pretends on-page polish is the growth lever.

## Arguments

| Flag | Effect |
|---|---|
| `--scorecard-only` | Phases 1-2 only (citation scorecard + entity signals). The fast "are we cited yet" check. |
| `--no-nominate` | Skip the knowledge nomination step. |
| `--dry-run` | Every read and test, no write (no scorecard file, no memory edit, no nomination). Surface the scorecard inline. |

## Hard rules

1. Zero em dashes in any output.
2. SENSE and RECOMMEND only. This loop does not edit a page, schema, or deployed file; does not
   deploy; does not submit anything; does not send email. The AUTONOMOUS moves are handed to the
   on-page-engineer (via `/seo-engine`); the OPERATOR moves are handed to you. Its allowed tools
   contain no deploy path by construction.
3. Never fabricate a citation, a stat, or a review. Every cell is Cited / Not cited / Unverified.
4. The autonomous and presence blocks are never blurred.
5. Every measurable move drafts a prediction_record for the executor to write at ship. None for
   llms.txt hygiene or schema-for-AI (see the evidence grades in GEO-STRATEGY.md).
6. Attribution links to external primary sources are correct and allowed; editorial CTAs stay
   internal per `content.cta_rule`.
7. Brand name and canonical description from CONFIG only.

---

## Phase 0: Pre-flight

```bash
date +"%Y-%m-%d"
ls -la .Codex/agent-memory/seo/GEO-STRATEGY.md .Codex/skills/seo/doctrine/geo-mastery/SKILL.md seo-engine/CONFIG.md
ls -t .Codex/agent-memory/seo/geo-scorecard-*.md 2>/dev/null | head -1 || echo "No prior scorecard: this is the baseline."
ls -t .Codex/agent-memory/seo/sensor-snapshot-*.md 2>/dev/null | head -1
```
If a retrieval MCP is configured, the agent loads its schema via ToolSearch; otherwise WebSearch
plus WebFetch is the proxy. If `--dry-run`, prefix every action `[DRY RUN]`.

---

## Phase 1: Citation scorecard

**Invoke `geo-citation-engine`** (synchronously). Brief it:

```
Run the GEO citation scorecard for {today}. Follow your operating procedure:
- Reuse the newest sensor snapshot's priority-query SERP block if present; spend retrieval only on
  what it lacks.
- Test every query in CONFIG targets.priority_queries. Per query and PER ENGINE: Cited / Not cited /
  Unverified, plus WHO is cited and the extractable trait that wins them the slot. Captured engine
  answers are ground truth when the citation test method allows; proxy results say so.
- Run the brand probes and COUNT independent (non-owned, non-directory) URLs mentioning the brand.
- Write the dated scorecard to .Codex/agent-memory/seo/geo-scorecard-{today}.md in the geo-mastery
  schema, diffing every signal against the prior scorecard.
- Return your tight summary.
{--scorecard-only: stop after the per-query table and the entity tracker. --dry-run: inline, no write.}
```

If retrieval is unavailable the agent falls back and labels it; if everything is blank it writes an
honest `unverified` scorecard. That is the correct outcome, not a failure to paper over.

---

## Phase 2: Entity signals (the leading indicators)

Confirm the agent captured the four that move BEFORE citation, each with a delta vs the prior
scorecard: sameAs markup (present with N profiles / absent, at `geo.entity_markup_location`);
Wikidata (id / none); the independent-mention count; the review count per platform in
`authority.review_platforms`. `--scorecard-only` stops here.

---

## Phase 3: Extractability audit (the autonomous on-page wave)

Audit the money pages (`targets.money_pages`, not the long tail) against the citation patterns in
the geo-mastery doctrine. For each pattern, record corpus status and the exact pages that miss it:

| Pattern | Check | The autonomous fix |
|---|---|---|
| Sourced stats (number + year + source link) | grep the money pages for bare numbers and unsourced claims | add inline sourced stats; the highest-weight on-page tactic |
| Attribution links to primary sources | are primary sources cited, or only internal links? | add attribution-only external citations |
| Named author with Person markup | byline a real person with a public profile, or the organisation? | named author + Person schema (needs the operator's byline decision) |
| Question-format H2s | do key H2s state the user's question and open with a 40-60 word answer? | convert key H2s |
| Tables with a hard number | does every comparison page carry a scored table with a benchmark? | add the table and number |
| Freshness | dateModified within 30 days on the money pages? | monthly refresh cadence |
| Depth | are the money pages substantially longer than the long tail? | deepen on refresh; never bloat the long tail |
| A free, citable artefact | does `authority.free_public_asset` exist and get cited? | publish or extend it (operator ships) |

This phase NAMES the exact files; it does not edit them.

---

## Phase 4: Report and memory

### 4.1 The ranked gap list (two owner-split blocks, per engine)
**AUTONOMOUS, on-page (hand to the executors):** ranked by impact over effort, each naming the exact
page, tagged with the engine class it targets, with a drafted prediction_record (what, by when, vs
which baseline).
**OPERATOR, presence (the unlock):** ranked by impact, leading with the unlock chain (free asset,
then curated lists, then reviews), each pointing at a ready-to-fire asset in
`.Codex/agent-memory/seo/authority-fire-pack.md` or the authority pipeline where one exists.

### 4.2 Memory and nomination (skip if `--no-nominate` or `--dry-run`)
The agent appends one line to the GEO section of `.Codex/agent-memory/seo/MEMORY.md`. Nominate to
`.Codex/knowledge-nominations.md` only a pattern confirmed across cycles with external ground truth.

### 4.3 The returned report
```markdown
## /geo-cycle complete, {today}

### Citation status
- Cited for any priority query: {No | which, by engine} (method: {proxy | direct | both})
- Presence classes held: {which}
- Trend vs {prior date}: {what moved}

### Who wins our priority queries (and why)
- {query}: {winner classes}, win on {trait}

### Entity signals
- sameAs {N | ABSENT} | Wikidata {id | none} | independent mentions {N} | reviews {N}

### Top AUTONOMOUS moves (ship now, for on-page-engineer via /seo-engine)
1. {move + exact page}, {impact}, prediction: {...}

### Top OPERATOR moves (presence, the unlock)
1. {move, asset ready at {path} | draft needed}, {impact}

### The one honest target this cycle
{the move that most advances corroboration}

### Scorecard: .Codex/agent-memory/seo/geo-scorecard-{today}.md
```

---

## Integration with /seo-engine

When `/seo-engine` runs, the geo-citation-engine is one of its SENSE agents and the scorecard feeds
the strategist's brief: the cheap on-page GEO moves ride in the same coordinated deploy as the
harvest work, and the OPERATOR block surfaces in the cycle report as your ready-to-act list. Run
`/geo-cycle` standalone when you want only the GEO pass.

## When NOT to run

- Immediately after the last run with no new deploy and no presence event; the scorecard moves on
  the cadence of engine retrievals and presence wins, not hourly. Monthly is the natural cadence;
  fire off-cadence on a lost-citation trigger or after a presence win lands.
- When every retrieval path is down; an across-the-board `unverified` scorecard is honest but not
  actionable.

## Maintenance

- Monthly: run the full loop; diff against last month; watch the leading indicators.
- On a presence win: re-run to capture the step-change.
- Quarterly: review which AUTONOMOUS moves shipped and whether their prediction_records held
  (`/seo-learn` grades them); demote gap-list items that never shipped.
