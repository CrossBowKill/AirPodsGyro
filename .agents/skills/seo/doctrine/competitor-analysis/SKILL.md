---
user-invocable: false
description: The competitive-intelligence doctrine for SEO. The 6-axis SERP-teardown scorecard (who holds top-3 and WHY), the two-camp weakness map (high-DA stale generalists vs low-DA specialists) and the open lane, content-gap stealing with the three-gate steal filter, the beatable-now filter for fights winnable on on-page alone, the reachable-rival DA-ceiling method, and the monitoring cadence with triggers. Load when the task is competitor teardown, "who holds this query and why", exploitable weakness, steal list, threat list, or "is this fight winnable".
version: 2.1.0
effort: high
---

# Competitor Analysis Doctrine

How to know exactly who you are fighting on every target query, why they hold the slot, where they
are exploitable, and which fights are winnable now. This is the method layer above the
`competitor-seo-analysis` and `keyword-gap-analysis` workflow skills. Your named competitors and
live positions come from `CLAUDE.local.md`, the Competitor Registry in
`.Codex/agent-memory/seo/MEMORY.md`, and fresh SERP pulls; this file is how to read them.

## 1. The ground truth to establish first

In most niches, a product site is not losing to better products. It is losing to free community
content with borrowed authority: forum threads, GitHub lists, and high-DR generalist blogs
republishing the same explainer. The recurring exploitable pattern, verify it in YOUR niche
page-by-page: **almost nobody pairs depth + structured data + freshness + a real product behind the
page. Most incumbents have 2 of those 4. Very few have all 4.** That is the wedge, and it tends to
be the same wedge on every cluster.

Three orienting facts to confirm from your own data:
1. Whether authority (not content) is your limiter: you rank 2-9 on commercial queries but cannot
   break the last positions. Then the competitive question is rarely "is our page good enough"; it
   is "can we pass THIS incumbent on the axis actually deciding THIS SERP, and is that axis
   on-page-cheap or authority-gated".
2. Whether per-query volume in your niche is genuinely small. If your reachable rival's whole domain
   converts high DA into modest traffic (section 5), the win is many mid/long-tail commercial slots,
   not one head-term jackpot.
3. Which head terms are doc-and-farm fortresses (official docs + several high-DA farms). Never brief
   those as quick competitive wins; you beat them on sub-intents, on SERP features, and after
   authority improves.

## 2. The 6-axis SERP-teardown scorecard

The core primitive: for a target query, score WHO holds top-3 and WHY. This turns "they rank #1"
(useless) into "they rank #1 on DA but score 0 on schema and 1 on freshness, so the open move is
schema plus a fresh date" (actionable). Score each holder 0-3 per axis:

| Axis | Scoring | 0 | 3 |
|---|---|---|---|
| 1. Content depth | comprehensiveness, advanced coverage | thin fragment | the definitive treatment, ~20k+ chars |
| 2. Structured data | FAQPage / HowTo / ItemList / Article + visible TL;DR | none | full stack + capsule |
| 3. Backlinks / authority | domain + page-level links | borrowed-only DA, no page links | high DA + page inbound |
| 4. Freshness | visible date, staleness on a year-stamped query | undated or months stale | current, maintained |
| 5. UX / extractability | tables, copy-paste assets, skimmability | wall of text | tables + downloads + TL;DR |
| 6. Real product behind it | is the page proof of a genuine product | affiliate ads / empty repo | authentic product demonstration |

Procedure: (1) pull the live top-3 and NAME them, never "various blogs"; (2) score each holder,
confirm rather than assume; (3) identify the open axis, the one they score 0-1 on that you can win
cheaply. Schema (axis 2) and a copy-paste download (axis 5) are the two you can almost always add
and the field almost never has; freshness (axis 4) is the wedge whenever a high-DA page has gone
stale on a year-stamped query; (4) cross the open axis with the authority benchmark to set the
realistic ceiling: against a low-DA specialist the open axis alone wins the slot; against a high-DA
generalist it gets you into the consideration set and authority decides the top; (5) write the
EXACT move: the specific axis + the specific asset + the predicted outcome.

The teardown record per query:
```
query | top organic holders (named) | their strength (axes at 3) | their exploitable weakness
(axes at 0-1) | our page + current GSC position | the exact move to outrank (axis + asset)
```

## 3. The two-camp weakness map and the open lane

Most competitive fields split into two camps, and neither closes the gap:

- **Camp A, high-DA generalists** (the big marketing blogs and education giants). Win on raw
  authority (axis 3 = 3) and usually nothing else: one-off pages, frequently stale on year-stamped
  queries, almost universally schemaless, no real product angle. Move: do not fight DA head-on.
  Exploit the freshness gap, add the schema they lack, take the specialist angle they never take.
  Realistic outcome: pass the mid-DA pages beneath them into top 5-8; the outright #1 waits for
  authority.
- **Camp B, low-DA specialists** (fresh niche sites, named-author blogs, exact-match repos and
  directories). Win on depth OR freshness OR a name OR exact-match + borrowed platform DA, but never
  on authority + schema together. Move: this is the winnable lane. Out-structure them with the axes
  they lack; a real maintained product site with one strong pillar out-ranks a near-empty repo.

**The open lane**: be the only page in the niche that is ALL of deep + schema-rich + continually
fresh + backed by a real product + (once the community links land) credibly authoritative. Every
teardown move is an application of moving one of your pages into that lane on the axis its specific
incumbent lacks. The playbook is never "write more"; it is "out-structure a two-of-4 field".

## 4. Content-gap stealing (the steal filter)

A gap = a query a competitor ranks for where you have no page or a weak one.

Find: pull the queries a tracked competitor's key pages rank for; cross against your corpus;
classify each gap NET-NEW vs UPGRADE. Most gaps are cheaper and safer as upgrades of an existing
page (no crawl-budget dependency, no new-page volume gate); net-new is reserved for a genuine
high-intent commercial term with no adjacent page.

Prioritize with three gates, in order:
1. **Volume gate**: validate real search volume before any net-new page. Sub-100/mo "gaps" are
   sections, not pages.
2. **Incumbent weakness**: Camp-B-held gaps convert to rankings fastest; Camp-A-held gaps are
   authority-gated.
3. **Buyer-adjacency**: does the query put a buyer in your consideration set? Buyer-adjacent gaps
   outrank pure-informational ones on the priority list.

**The consolidation caveat**: when a gap sits inside a cluster you already over-cover, the steal
move is CONSOLIDATE to one canonical pillar + add schema, never a new page. Pull the cluster's GSC
data, keep the strongest as canonical, 301/canonical the rest.

Special patterns worth watching for: a paywalled incumbent (publish the FREE complete version and
out-rank the teaser), an exact-match repo with near-zero substance holding a slot on name alone
(one real pillar takes it), and a prose-only "best X" field (a maintained ranked table owns it).

## 5. The beatable-now filter and the reachable-rival ceiling

**Beatable-now** (the fastest competitive lane, the first call every cycle): a page qualifies when
ALL hold: (1) you already rank page 1-2 with real impressions; (2) the pages immediately ahead are
Camp B, or a Camp A page stale/schemaless on the deciding axis; (3) the deciding axis is
on-page-cheap (schema, a fresh date, a download, an intent-matched snippet), NOT raw authority.
Every beatable-now row needs no new content and no new authority; it is harvest, and it is the
competitive front's most valuable deliverable.

**The reachable-rival DA-ceiling method**: identify the strongest specialist in your niche that a
bootstrapped site could plausibly catch (not the DA-90 generalists). Then answer two questions from
its data:
1. What does its authority actually convert to in traffic? If high DA converts to modest visits,
   that proves the niche's per-query volume is small and the win is breadth of mid-tail slots.
2. **What is its moat, really?** Look past the content volume. The moat is usually ONE structural
   asset: a founder's official ambassador status, a moderator seat in the category's biggest
   community, a canonical free tool. You cannot out-publish that moat; you counter it through your
   own community presence and assets, not more posts. Meanwhile, beat the rival now on the axes it
   lacks (typically schema + freshness) on the mid and long tail, where per-query authority matters
   less.

The honest ceiling: you likely need the reachable rival's tier (DA ~45-55) plus structure, not
DA 90. Carry the caveat into every prediction: a flat result on a term the rival or a generalist
holds CONFIRMS the authority limiter; it does not mean your on-page move failed. Score
authority-gated and on-page-winnable fights separately.

## 6. Monitoring cadence and triggers

Re-check each cycle: the top-3 holders for every money-cluster query (new entrants, overtakes,
closed freshness wedges); the beatable-now list (still page 1-2? incumbents still beatable? did a
shipped move land?); competitor asset launches (a rival's linkable asset is an authority threat);
the DA benchmark quarterly.

Opportunity triggers that warrant an immediate focused response (see `/seo-watch`):
- A competitor OVERTAKES you on a money term you held.
- A NEW entrant takes a top-3 slot on a tracked query.
- A high-DA incumbent's page goes STALE on a year-stamped query (a wedge just opened; steal it).
- A competitor launches a linkable asset (route to the authority work).

Output schema per money cluster: a threat list (query | named holders + axis scores | movement |
threat level), a beatable-now steal list (our page | position | the axis the incumbent lacks | the
on-page move | effort), new entrants / asset launches, and the ONE highest-ROI competitive action
this cycle.

## Hard rules

- Real URLs, named competitors, specific moves only. A category is not a competitor; a vague move is
  not a move.
- Never fabricate a position, DA, or ref-domain count. SERP-verify or label it an estimate with a
  date.
- Honesty on the authority caveat: authority-gated flat results are reported as authority-gated,
  never as on-page failure.
- Via negativa: no head-on fights with DA-90 generalists; no out-publishing the reachable rival's
  structural moat; no new pages into over-built clusters; no net-new page without the volume gate;
  the competitive front is not a content-generation engine, its best output is the beatable-now
  harvest list.

## Learnings

*(append confirmed competitive learnings only after external ground truth: a position shift
verified, a beatable-now move that hit its predicted rank, a new entrant validated)*
