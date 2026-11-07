---
user-invocable: false
description: The keyword-strategy doctrine for deciding WHAT to rank for, especially from a low-authority domain. Harvest-beats-plant, striking-distance identification, the six rank-lift levers, CTR-rescue mechanics, the three SERP archetypes (winnable now, first-mover, authority-gated fortress), intent mapping, keyword-to-page mapping and cannibalization, and the three-gate build rule for new pages. Load when the task is "what should we target", "is this term winnable", striking distance, CTR leak, or "should we build a page for X".
version: 2.1.0
---

# Keyword Mastery Doctrine

How to decide what to rank for, and how to take the top slot fastest, on a domain that does not yet
have the authority to win everything. The domain, priority keywords, and live rankings come from
`CLAUDE.local.md`, the keyword maps, and GSC data; this file is the decision method.

## 1. The governing principle: harvest beats plant

A keyword you already rank for on page 1 is worth more, and far cheaper to win, than a keyword you
would have to earn from scratch. The impressions exist, the ranking exists, the crawler already
trusts the page; all that remains is to lift it and fix the snippet. Planting a new page means
earning a ranking from zero, which on a low-authority domain is slow, link-gated, and uncertain
(the crawler may not even fetch it). The fixed priority order:

1. **HARVEST the page-1 leakers** (CTR-rescue + rank-lift): pages at positions 2-15 with real
   impressions and below-expected CTR. Weeks, mostly free. Top priority every cycle.
2. **WIN the weak SERPs** (first-mover): queries where only repos, forum threads, or thin blogs
   rank. On-page upgrades plus modest links take the slot.
3. **PLANT only through the build gate** (section 7). Rare by design.

The cost math: a harvest target already has impressions; the action is one proven lever applied to
an existing asset with no new-content risk and no crawl-budget dependency. An hour on a speculative
long-tail post is an hour stolen from the named harvest board. The corollary: a high-volume
long-tail publishing firehose is a known dead end on low-authority domains (Google stops crawling
the backlog; the classic programmatic-SEO trap of many tiny rankings with a low ceiling).

## 2. Striking-distance identification

A striking-distance target qualifies when ALL hold:
1. **Position 2-15** (page 1 or near). Above ~3 with a leaking CTR it is a pure snippet fix; below
   ~15 it is a longer rank-to-page-1 play.
2. **Real impressions**, not a rounding error. Hundreds-plus on a single page is worth the lever.
3. **CTR below the position-expected rate** (see the CTR table in the seo-mastery doctrine). The gap
   between earned impressions and earned clicks IS the opportunity size.
4. **Commercial or high intent**, or a high-volume funnel feeder.

Rank the queue by **impact x effort**: impact = impressions x CTR gap x intent weight; effort = LOW
for a pure snippet fix (verbatim H2 + answer box at a good position), MED for a page-2-to-page-1
lift, and flag anything authority-gated separately (the on-page is cheap but the ceiling is gated).

## 3. The six rank-lift levers (impact order)

The repeatable bundle for a page-1-but-not-#1 page. Apply the full bundle to a contested commercial
page; the snippet subset to a pure CTR leak. Never apply it to the long-tail.

1. **Comparison / spec table at the top.** Commercial queries ("best X", "X vs Y") are won by
   tables, not prose. Lead with a scored feature table carrying at least one hard number per row.
   The table wins the SERP, the featured snippet, AND the AI citation (tables extract at ~81% vs
   ~23% for prose).
2. **PAA-targeted FAQ block.** 4-5 entries answering the literal People Also Ask questions for the
   query, with FAQPage schema. Add to high-impression commercial pages via the cycle, not blindly
   corpus-wide.
3. **Verbatim-query H2 + answer box.** When a page ranks well but leaks clicks, the snippet does not
   match the literal intent. Add an H2 phrased as the user's exact query with a short self-contained
   answer under it. The single cheapest highest-delta fix for a good-position zero-CTR page.
4. **Depth on money pages only.** Contested money pages need genuinely comprehensive coverage
   (roughly 20k+ characters is the observed win threshold on contested commercial pages). Do NOT
   bloat the long-tail; depth is a money-page lever.
5. **3+ contextual inbound links from the hubs.** Orphans cannot rank. Every harvest target gets at
   least 3 inbound links from relevant hub pages on day one. Free, and it compounds.
6. **Freshness with a wedge.** Find the recent change the incumbents missed and lead with it, bump
   `dateModified`, resubmit the sitemap (quota-free) so the re-crawl picks up everything above.

## 4. CTR-rescue mechanics

Diagnosis: a position-vs-CTR mismatch on page 1. A position-3 page at 0% CTR is a snippet problem,
not a ranking problem. Leak size = impressions x (expected CTR at position minus actual).

The fix:
1. **Title matched to the literal query and intent.** A decision query wants a decision frame
   ("X vs Y: Which to Pick in {year}"); a buyer query wants benefit + year; a yes/no query wants the
   answer in the title. The title is the single biggest CTR lever.
2. **Meta description that pre-answers** the one fact the searcher came for (the price, the verdict,
   the differentiator).
3. **Verbatim-query H2 + answer box** when the snippet still cannot match a precise query (lever 3).
4. **Template-level fixes** for corpus-wide snippet drags (a bad suffix, truncation, a rendering
   artifact in every SERP title): fix once at the template, not per page.

Honest note: title rewrites exhaust quickly. Once the high-value titles are rewritten, the remaining
CTR lever is the verbatim-H2 snippet match on specific named leaks; the bigger lever becomes
rank-lift plus authority. Never brief "rewrite all titles" as if it were fresh ground twice.

## 5. The three SERP archetypes (difficulty for a low-authority domain)

Keyword difficulty is not a tool score; it is a SERP-archetype judgment: WHO holds this SERP, and
can a low-authority page with a better asset displace them? Misclassifying a fortress as a quick win
is the most expensive keyword mistake.

- **Archetype A, winnable now.** The SERP is held by generalist content blogs with no category
  authority, or you already rank page-1. Action: harvest or upgrade. Real top slots in weeks.
- **Archetype B, first-mover.** The top results are repos, forum threads, Medium posts, or thin
  directory pages, with NO authoritative editorial page. Action: build or upgrade the definitive
  editorial page (ranked table, depth, FAQ, schema, freshness wedge) plus modest links. These are
  the genuine fast #1s.
- **Archetype C, authority-gated fortress.** The official docs for the category plus 3+ high-DA
  content farms hold the SERP with deep fresh pages. No low-authority page beats this on-page-alone.
  Action: target the featured snippet / PAA only (format wins that do not need the organic #1), or
  shelve behind the authority work. Never brief the head term as a quick win.

Universal gate: for ANY contested target the ceiling is authority. Pair every contested build with a
link plan or do not commit it.

## 6. Intent mapping and the conversion mechanic

- **Informational** ("what is / how to"): explainer with definition box + steps + TL;DR. Earns a
  page only at real volume as a funnel feeder; the win is often the snippet.
- **Commercial** ("best / vs / alternative / review"): table-led comparison or listicle. This is
  where the money lives; the searcher is shortlisting.
- **Transactional/buyer** ("pricing / worth it / free"): plan-comparison table + offers schema +
  decision framing. Highest value.

The conversion mechanic to verify with YOUR data rather than assume: on many product sites, blog
pages convert almost nothing directly; branded homepage searches convert at high rates. If that
holds for your domain, the job of a commercial page is to put the brand in the buyer's consideration
set and route them, via strong internal links to the homepage/pricing, toward the page that actually
converts. The internal link IS the conversion lever, not a blog CTA.

## 7. Keyword-to-page mapping, cannibalization, and the build gate

**One search intent, one canonical page.** Two pages on the same intent split impressions, links,
and signals so neither wins, and Google oscillates between them.

- Detect: two+ pages ranking for the same query at mediocre positions; over-built clusters from past
  publishing eras.
- Resolve (data-checked, never a blind merge): pull each competing page's GSC impressions and
  position; keep the strongest as canonical; 301/canonical the rest by sub-intent or
  re-differentiate to a genuinely distinct intent; re-point internal links to the survivor.
- Never add a page to an over-built cluster. The fix is consolidation, never expansion.

**The build gate: a brand-new page ships only when it clears ALL THREE:**
1. **Volume validation**: real search volume checked first (GSC for terms you rank for; a keyword
   tool for terms you do not, since GSC cannot size a term you do not rank for). Rule of thumb
   ~200+/mo OR clear commercial intent. Below that it is a section inside a pillar, not a page.
2. **Commercial intent + conversion path**: a plausible path to revenue, a real product tie-in, and
   an internal link to the converting page. Pure informational long-tail with no path does not earn
   a page.
3. **Authority-aware**: for any competitive term, pair the build with a concrete link plan
   (directories, community lists, a linkable asset). No link plan, no contested build.

Format rule for any new page: LEAD with the format that wins its SERP (ranked table for "best X",
side-by-side for "vs", copy-paste download for "template"). Never plant a prose essay on a
commercial query.

## 8. Measurement

- KPIs: organic revenue and assisted conversions, branded-search growth, non-branded clicks to
  COMMERCIAL pages, conversion rate by landing page. Raw clicks / impressions / indexed-count are
  the vanity metrics that hide the long-tail trap.
- **Every measurable keyword move writes a prediction_record at output time** ({predicted_outcome,
  by_date, baseline}, per the Calibration spec in `.claude/agent-memory/seo/MEMORY.md`): the
  specific position + CTR change predicted and the date to verify (+28d for rank/CTR effects).
- The honest caveat in every prediction: contested-term gains are gated on authority. A flat result
  on a contested head term CONFIRMS the authority limiter; it does not mean the on-page failed.
  Record the prediction so `/seo-learn` can distinguish the two.
- Never re-touch a page with a maturing prediction; it corrupts the measurement window.

## Hard rules

- Zero fabricated volumes, positions, or CTRs. GSC and real tools only; estimates labeled.
- The build gate is non-negotiable. Harvest before plant, always.
- Do not brief an Archetype-C fortress as a quick win; snippet/PAA only or shelve.
- Do not chase raw impressions; measure revenue, branded growth, commercial-page clicks.

## Learnings

*(append confirmed keyword learnings only after external ground truth: a GSC movement at the
day-7/28 measurement, a confirmed capture, a confirmed consolidation win)*
