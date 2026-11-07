---
user-invocable: false
description: The SERP-feature capture doctrine for winning featured snippets, People Also Ask slots, and Google AI Overview inclusion, the results ABOVE the blue links, won by on-page FORMAT rather than authority. The four snippet formats (paragraph, list, table, definition box), the PAA question-H2 pattern, the query-type-to-format mapping, and the capture-and-measure loop. Load when the task is featured snippet, position zero, PAA, answer box, AI Overview format, or "how do we win the box above the results".
version: 2.1.0
---

# SERP Features Doctrine

How to win the results that sit above the ten blue links: the featured snippet (position zero), the
People Also Ask accordion, and the Google AI Overview. On a low-authority domain that struggles to
crack the last organic positions, these are the highest-ROI clicks available, **because they are won
by on-page FORMAT, not by authority**: a page at organic position 3 with the right answer block can
win the box ABOVE positions 1 and 2.

## 1. The ground truth

Three facts govern every feature decision:

1. **Google pulls the snippet from a page already ranking on page 1** (usually top 10, often top 5).
   Feature capture is therefore a HARVEST move: it layers onto a page that already ranks. It pairs
   naturally with the beatable-now list (same pages, an extra win). Never target a feature from a
   page below page 1; rank-lift first, then the feature.
2. **The archetype target is the high-position, high-volume, near-zero-CTR page** where the organic
   #1 is authority-gated (often the official source on its own brand query). You cannot pass the
   incumbent organically, but a 40-55 word definition box answering the query verbatim can win the
   snippet that sits above position 1 and capture the click the rank is leaking. The snippet is the
   realistic #1-slot win precisely WHERE the organic #1 is out of reach.
3. **The format must match the query's expected answer shape.** Paragraph for "what is", numbered
   list for "how to / steps", table for "compare / spec". The wrong shape forfeits the box even from
   a top-3 rank.

## 2. The four winning formats

Cross-format rules first: the answer block goes at the very TOP of the page; it must be
self-contained (reads correctly out of context, no "see above"); one question per heading, phrased
as the user's literal query; shape follows intent.

### A. Direct-answer paragraph (for "what is / why / definition")
A 40-55 word self-contained paragraph answering the query BEFORE any elaboration, immediately under
a question-format H2 (or the H1 for the head query). Lead with the answer, not the context: the
first sentence must stand alone as the answer. Median snippet paragraph is ~40-50 words; the median
AI Overview answer is ~67 words [Pew], so write in that band.

### B. Numbered or bulleted list (for "how to / steps / causes / fixes")
A numbered list (ordered steps) or bulleted list (unordered set) at the top, introduced by a
one-line stem naming the list ("Six causes of {problem}, and the fix for each:"). Items
self-contained, parallel, one or two lines each (long items get truncated and can drop the page from
the box). Ordered for how-to; bullets for causes/types. **Weak-SERP troubleshooting queries (where
the #1 is a forum thread or an issue tracker) are the highest-odds list-snippet captures anywhere.**

### C. Table (for "compare / spec / pricing / vs / best")
A clean comparison or spec table near the top with a clear header row, carrying at least one HARD
number (a price, a benchmark, a limit): numbers are the single highest-impact extractable unit, and
tables extract far better than prose. Keep it tight; a sprawling 12-column table will not lift
cleanly. Every vs-* and pricing page should carry a table-snippet-shaped block.

### D. Definition box (for "what is X / X meaning")
Format A specialized for pure-definition intent: a tightly bounded 40-55 word definition immediately
under a heading that IS the term or the literal "What is X?" question, quotable verbatim, leading
with the term ("An X is a ..."). Follow with a short components list (which can win a second
feature). The most important format for head informational terms where the organic #1 is
authority-gated.

## 3. People Also Ask (the multiplier)

Each PAA entry reveals a snippet-style answer lifted from a ranking page, so one correctly formatted
page can win SEVERAL PAA slots. The winning pattern: **a question-format H2/H3 matching the PAA
question verbatim, immediately followed by a concise 40-55 word answer.**

Build procedure:
1. Harvest the actual PAA questions for the target query (expand the live accordion; each expansion
   surfaces more). Record the literal phrasing.
2. Add each as a question-format heading on the ranking page, worded as close to the PAA phrasing as
   reads naturally.
3. Answer each in 40-55 self-contained words, answer first.
4. Wrap the Q&A in an FAQ block with FAQPage schema: 5-7 discrete targets from one block, and the
   block doubles as the paragraph snippet, the AI Overview source, and the AI-engine citation
   target. One block, four surfaces.

## 4. Google AI Overviews (the GEO overlap)

The AI Overview sits above everything, synthesizes from 2-3 cited sources, and its extractable unit
is the same 40-67 word self-contained capsule. **The on-page work that wins a featured snippet, an
AI Overview citation, and a ChatGPT citation is largely the SAME work**: front-loaded answers,
sourced facts, lists, tables, question headings, freshness. Ship the extractability wave once to the
top ~20 money pages and it serves every surface.

The zero-click read: a definition-box or AI-Overview win on a head term may show a smaller CTR lift
than expected because the answer is satisfied on the SERP. That is the feature WORKING: you own the
answer the user reads, which feeds branded demand even without the click. Report the appearance and
the CTR together; never call an appearance-without-clicks a failure.

Division of labor: this skill owns the FORMAT and the Google-SERP surface; the geo-mastery doctrine
owns entity work, presence, and the non-Google engines. They meet at the AI Overview.

## 5. The query-type-to-format mapping

The load-bearing lookup. Classify the intent, read off the feature and format, add the matching
schema. Never mismatch.

| Query type | Feature target | Winning format | Schema |
|---|---|---|---|
| Definition / "what is X" | Snippet + AI Overview | Definition box (D) / paragraph (A), verbatim heading | Article, FAQPage |
| How-to / steps | Snippet (list) + PAA | Numbered list (B) at top | HowTo |
| Causes / fixes / troubleshooting | Snippet (list) | "N causes and fixes" numbered list (B) | FAQPage |
| Compare / "X vs Y" | Snippet (table) + PAA | Table (C) with a hard number + PAA FAQ | FAQPage |
| Pricing / spec / cost | Snippet (table) | Plan-comparison table (C) | Product/offers |
| Best / ranked | Snippet (table/list) + AI Overview | Ranked table (C) | ItemList |
| Yes/no ("is X free / worth it") | Snippet (paragraph + list) | One-line verdict (A) + supporting table | FAQPage |
| Precise long-tail how-to | Snippet (often near-uncontested) | Verbatim H2 + short direct answer (A) | as fits |

## 6. The capture-and-measure loop

Feature work is measurable and must be measured; every feature target writes a prediction_record
(see the Calibration spec in `.Codex/agent-memory/seo/MEMORY.md`).

1. **Target** (strategy): source candidates from pages already ranking page-1, especially page-1
   rank + sub-1% CTR, on a query type that wins a feature. Prioritize by capture odds x volume x
   leak. Highest odds: weak-SERP troubleshooting lists, near-uncontested long-tail, definition boxes
   where the organic #1 is authority-gated. Confirm what the live SERP currently shows and who holds
   any existing feature (a held snippet can be displaced by a better format; an absent one can be
   seized).
2. **Ship** (on-page): the mapped format at the TOP, the matching schema, the literal-query heading,
   a `dateModified` bump, the normal deploy. Write the prediction_record: page, query, feature,
   current position + CTR, predicted capture + CTR lift, the day-7/day-28 re-check date.
3. **Verify capture**: re-check the live SERP after re-crawl (resubmit the sitemap to force it;
   quota-free). A capture is binary per feature: you hold it or you do not. Never claim a capture
   not seen on the live SERP.
4. **Measure the CTR delta**: the real KPI is the GSC CTR delta at day-7/day-28 against the pre-ship
   floor, read together with the appearance (the zero-click caveat). Feed the result to `/seo-learn`:
   a confirmed capture + lift promotes the format pattern; a miss diagnoses format-wrong (fixable)
   vs rank-too-low (rank-lift first).

## Hard rules

- Never fabricate a stat, benchmark, or capture. Numbers carry a real year and source; captures are
  verified on the live SERP, not claimed from the edit.
- Format follows intent, always. The wrong shape is the most common capture failure.
- The answer block goes at the top, self-contained.
- Read zero-click honestly: appearance + CTR together.
- Via negativa: no feature targets on pages below page 1; no extractability wave on the long-tail
  (top ~20 money pages + the capture queue only); no chasing the organic #1 on a head term the
  official source owns (the snippet is the win); no feature block without matching schema and a
  prediction_record; a screenshot of the box is not the KPI, the GSC CTR delta is.

## Learnings

*(append confirmed feature learnings only after a verified live capture plus the GSC CTR delta at
day-7/28)*
