---
name: community-evidence-extraction
description: >
  The extraction, audit, repair and grounding-check pipeline for turning a pile of
  community posts (a forum, a members' community, a newsletter archive, a chat
  export) into graded evidence cards you can cite. Load when the user says "mine
  this community", "turn these posts into evidence", "extract case studies",
  "grade these claims", "audit the cards", or "is this synthesis grounded". Not for
  live web research on a single question (use /research) and not for a quick
  summary of one post.
version: 1.0.0
user-invocable: true
---

# Community Evidence Extraction

## Why this exists

A community of practitioners is the richest source of self-reported evidence there is, and the least reliable. Posts are success stories. Numbers belong to clients, commenters, or cited studies as often as to the author. A first pass by a fast model will credit a client's result to the founder at scale: the first run of this pipeline measured a 20 percent major error rate in a 20-card sample, almost all attribution. The pipeline below exists so that what you cite afterwards is graded, attributed, and traceable to the exact passage. It feeds the engine's evidence-grading rubric (a community post is a "blog or forum assertion", LR 1.0 to 1.3, until its number is verified).

## The pipeline, in order

### 1. Capture text first, media second

Sweep listing pages for post identifiers, then fetch each post and its full comment tree. Strip author and commenter names at the source; never store them. Save raw posts as JSON with a stable `id` per post (`C001`, `C002`, ...). Run a second sweep for attachments, embedded videos, and polls; the text route usually misses them. Caption videos where the transcript matters and expect rate limits (retry with gaps). Delete any attachment you are not licensed to hold; keep only a paraphrased framework.

Checks: post count and comment count match the community's own counts. Confirm with the user whether personal names may be stored at all (default: no).

### 2. Extract to cards against a spec

Write the extraction spec before any extraction (`references/EXTRACTION-SPEC.md` is the shipped one). Batch 12 to 15 posts, or about 90KB, per extraction agent on a fast model. Every field comes from the source text; a field the source does not state is null. The `evidence` field is the only verbatim text, at most 15 words. Grades are honest: `numeric` needs a number, `specific` a concrete action, `vague` a general claim, `opinion` a belief. Reconcile the batches with a script that checks counts, verbatim evidence, and adds a `source` block per card.

### 3. Audit everything, not a sample

Audit every card against its raw post in fresh context on a stronger model, 15 to 18 pairs per auditor, using `references/AUDIT-SPEC.md`. The auditor checks numbers, attribution (own result, client result, commenter claim, cited study), verbatim evidence, grade generosity, invented content, missed gold, leftover names, and the richness score. Give auditors a read-only pair printer so parallel agents cannot overwrite each other's helpers, and check pack coverage afterwards: one agent auditing the wrong pack after a scratch-file collision is a real failure mode.

### 4. Repair with verification

Repairers (`references/REPAIR-SPEC.md`) re-check every audit finding against the raw text before applying it, because auditors are wrong too. They tag every number by whose it is, move sound decisions out of `mistakes_and_reversals` into `decisions`, add `caveats` for arithmetic that does not add up, and mark every comment gem `by: author` or `by: commenter`. Merge with a script that re-verifies quotes and rebuilds the index. Target: zero rejected merges, every quote verified.

### 5. Synthesise in slices, then ground-check

One compact slice per lens (pricing, acquisition, retention, operations), pattern finding on a mid model, judgement-heavy pieces on the strongest model. Never filter by relevance when the owner wants everything: summarise the leftovers too, or 40 percent of the corpus silently vanishes from every conclusion. Then run the grounding check on every synthesis file:

```bash
node .Codex/skills/analyst/community-evidence-extraction/scripts/grounding-check.mjs \
  synthesis/pricing.md --cards library/cards.json --raw raw/posts.json
```

A number quoted on a line next to a card id must appear in that card or its raw post. Unmatched numbers are allowed only when they are derived arithmetic, and those get a `(derived)` note.

### 6. Wire it in

Ship a skill or reference file with a file table (cheapest first), a query tool, a compact index, and an approval queue for anything the user must sign. The library is evidence for the engine, never a replacement for its own research.

## Grades and attribution tags

| Grade | Requires |
|---|---|
| `numeric` | a number in the source, with unit, period and subject |
| `specific` | a concrete action, no number |
| `vague` | a general claim, however confident |
| `opinion` | a belief or advice |

Context prefixes on numbers: `own result`, `client result:`, `commenter claim:`, `cited, not own result:`. A card whose `stage.revenue_reported` holds a client's figure is a major error.

## Worked example (fictional, for illustration only)

A 60-post community thread on freelance pricing. Capture yields 60 raw posts and 410 comments, names stripped. Extraction produces 60 cards; a tactic on card C017 reads "raised day rate from $400 to $650 after a portfolio rebuild", grade `numeric`, evidence "went from 400 a day to 650". The audit finds that $650 was quoted by a commenter describing their own agency, not the author: major error, attribution. The repairer confirms it in the raw text, moves the figure to `numbers` with context `commenter claim: $650 day rate`, downgrades the author's tactic to `specific`, and adds a caveat. The pricing synthesis then cites C017 for the portfolio rebuild but not for the $650, and the grounding check passes with 0 unmatched numbers. Ten minutes of audit prevented a wrong benchmark from entering the dossier.

## Output

Per run, three artifacts and one line:

```
library/cards.json        one card per post, repaired: true on every card
audit/repair-report.json  cards_checked, major, minor, rejected_merges (must be 0), quotes_verified
synthesis/*.md            one slice per lens plus leftovers.md, each grounding-checked
```

Return line: `EXTRACTED <n> cards | audited <n> (major <m>, minor <k>) | repaired <n> | grounding: <files> files, <x> unmatched numbers`.
