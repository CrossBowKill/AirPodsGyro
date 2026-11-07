---
user-invocable: false
description: The GEO (Generative Engine Optimization) strategy doctrine for winning citations inside ChatGPT, Codex, Perplexity, Gemini, and Google AI Overviews. The 5 citation factors operationalized, the measured extractability patterns, entity strengthening in dependency order (sameAs, Wikidata, canonical description), the 7 high-trust presence source classes, the citation scorecard methodology, and honest measurement. Load when the task is "are we cited by AI", citation scorecard, entity signal, extractability strategy, or "why is our brand not cited".
version: 2.1.0
---

# GEO Mastery Doctrine

How to be the answer inside the AI engines, not just on Google. This is the strategy layer above
the `geo-readiness-audit` and `ai-visibility` workflow skills: those score and track; this explains
what actually moves citation and in what order. Your domain, brand, and priority queries come from
`CLAUDE.local.md` and `.Codex/seo-config.yml`.

## 1. The two halves, and which one is usually the limiter

On-page **extractability** makes a page citable. Off-page **corroboration** makes it retrieved and
trusted enough to cite. Roughly 84% of AI citations flow through earned media rather than the
brand's own domain [thepuffer.fish 2026], so an uncovered brand hits a ceiling no on-page template
can fix. Diagnose which half is YOUR gap before spending effort:

- Search your brand's exact positioning. If every result is owned by you (your site, your posts,
  your listings) or a directory you placed, the gap is corroboration: no trusted third party has
  ever described you, so engines cannot cite you regardless of page quality.
- If independent coverage exists but your pages lead with prose, lack sourced numbers, and have no
  answer capsules, the gap is extractability, the cheap half; ship it first.

Most young or low-authority brands are corroboration-limited. On-page is necessary, bankable, and
autonomous; presence is the unlock. A pass that ships only on-page work and claims GEO progress is
dishonest.

## 2. The 5 citation factors, operationalized

1. **Topical authority**: the backlink graph + mentions in trusted sources + training-data presence.
   The same trust graph classic search uses. Lever: earned third-party mentions in the sources
   engines already retrieve (section 5). This is usually THE limiter.
2. **Retrieval relevance**: semantic match + freshness + passage clarity. Lever: open every section
   with a 40-60 word self-contained answer capsule (44.2% of ChatGPT citations come from the first
   30% of the page [Kevin Indig 2026]); phrase H2s as the user's question; keep `dateModified`
   within 30 days on the citation corpus (a 3.2x citation advantage; Perplexity's median cited-page
   age is ~32 days).
3. **Extractability**: can the model pull a clean, discrete, citable claim? Lever: the patterns in
   section 3. Sourced statistics are the #1 single tactic (+40% AI visibility, Princeton GEO paper).
4. **Source diversity**: engines cite 2-3 sources per answer; a brand corroborated across MORE trust
   classes wins one of those slots. Lever: presence in at least 2 high-trust classes, not depth on
   one page.
5. **Brand match**: consistent brand references in trusted sources. Lever: ONE canonical 1-sentence
   description used verbatim on every directory, profile, package registry, and review listing, plus
   the entity anchor (section 4). Engines discount a brand describing itself; consistency plus
   third-party corroboration is what counts. Matters double for a collision-prone brand name.

Factors 1+4+5 are won by PRESENCE + ENTITY (needs the operator's accounts and identity). Factors
2+3 are won by EXTRACTABILITY (autonomous, ship now). A complete GEO pass ships the autonomous half
and arms the operator with the presence half.

## 3. The measured extractability patterns

Apply to the top ~20 citation-worthy pages (comparisons, feature explainers, core concepts), never
the long-tail. Each with its measured basis:

| # | Pattern | Why it wins |
|---|---|---|
| P1 | Direct-answer first line: 40-60 word self-contained capsule before any elaboration | 44.2% of ChatGPT citations from the first 30% of the page; median AI Overview answer ~67 words [Pew] |
| P2 | Sourced statistics: number + year + primary-source link on every key claim | #1 single tactic, +40% AI visibility [Princeton GEO]; pages with 19+ data points cited ~2x vs 5 or fewer [Contently] |
| P3 | Inline external authoritative citations (attribution links to primary sources) | Top-3 tactic; lower-authority sites see the biggest lift. Citing trustworthy sources makes YOUR page read as trustworthy |
| P4 | Comparison tables with at least one hard number per row | Tables extract at ~81% vs ~23% for prose [Contently] |
| P5 | Question-format H2s + FAQ blocks | FAQ sections boost citation ~2.6x and create 5-7 discrete citation targets per page |
| P6 | Freshness: dateModified within 30 days on the citation corpus | 3.2x citation advantage; updates within 90 days outperform older by ~67% |
| P7 | Named human author + Person schema + sameAs (not the org as author) | Author identity is a trust input for every engine |
| P8 | Depth over ~20k characters on the money pages | 4.3x more citations [ConvertMate 2026]. Money pages only; do not bloat the tail |
| P9 | Full JSON-LD stack (Article + Person + Organization + FAQPage + HowTo) with real dates | The highest-leverage structured-data investment |

Order of attack: P2 sourced stats, P3 external citations, homepage sameAs (section 4), P7 named
author (needs the operator's byline decision), P5 question H2s, P4 tables + numbers, P6 freshness
cadence. Note the reconciliation with a keep-links-internal editorial policy: attribution/citation
links to primary sources are external and correct; the editorial CTA, the "next link to click",
stays internal. The two rules do not conflict.

## 4. Entity strengthening (dependency order)

Without a canonical entity anchor, an engine seeing your brand across the web must infer identity
from context, which is unreliable for smaller brands and produces confused attributions and missed
citations. Do these in order:

1. **`sameAs` array on the homepage Organization/Product JSON-LD** (autonomous, this week). The
   field that does the most work for entity reconciliation. Priority order for entries: Wikidata,
   GitHub, LinkedIn, Crunchbase, package registries, social profiles. Add each authoritative profile
   as it goes live.
2. **Wikidata entry** (draft autonomously; the operator submits). The strongest single signal for
   entity inclusion, with a lower notability bar than Wikipedia, and its dumps feed LLM training
   pipelines directly. Minimum fields: instance of, official website, inception, country, source
   code repository where applicable. Add the Q-id to the homepage `sameAs` within 48h to complete
   the bidirectional link.
3. **One canonical description everywhere.** A single 1-sentence and one longer description, used
   verbatim on every listing. Reworded taglines lower entity confidence.
4. **Wikidata relationship links** on related concept entries (free, lower priority).
5. **Wikipedia only if notability is genuinely demonstrable.** Do not force it; Wikidata is the
   right tier for most products.

Knowledge panels cannot be requested; they are earned by being a well-corroborated entity. Track
entity strength as: sameAs completeness, Q-id existence, count of independent non-owned URLs
mentioning the brand, review count.

## 5. The 7 high-trust presence source classes

Where engines actually source category answers, in rough trust order. Run YOUR category's version of
this scan (which classes do the engines cite for your priority queries?) and score presence:

| # | Class | Why engines trust it | How to win it |
|---|---|---|---|
| S1 | Canonical community-curated lists (the category's definitive awesome-list or index) | The curated index; near-canonical retrieval weight | Submit the free, focused, installable artifact, not the paid umbrella product; follow the maintainer's exact process |
| S2 | Reddit (the category subreddits) | Heavily weighted for practitioner answers | Value-first answers, aged account, plain disclosure |
| S3 | Hacker News / equivalent | High citation weight, genuine technical interest | A real launch or write-up with a genuine hook; one shot, do not waste it |
| S4 | Review platforms (Trustpilot, G2, Capterra, Product Hunt) | Third-party reviews trump self-description; ~88% of AI review-citations come from the top 5 platforms | The review flywheel: honest post-purchase asks, never gated or incentivized-for-positive |
| S5 | Independent named-author blogs | E-E-A-T + independent corroboration | One guest post, or an independent reviewer with access |
| S6 | "I tested N tools" roundups | Firsthand-evaluation framing engines love | Roundup authors list what they can install/test free; a free artifact or reviewer access is the wedge |
| S7 | Wikidata / Knowledge Graph | Feeds training dumps directly; the entity backbone | Section 4 |

**The unlock chain**: (1) a free, installable, citable artifact exists (a paid product alone rarely
gets listed); (2) that artifact plus first reviews gets you into 2+ high-trust classes; (3) that
corroboration is what finally lets engines cite you. **Citation follows corroboration, never the
reverse.**

## 6. The citation scorecard methodology

The GEO equivalent of rank tracking. Run monthly (and on a lost-citation trigger from `/seo-watch`).

- **The priority query set**: 5-6 queries a buyer would ask an AI engine in your category, plus the
  literal brand probes ("what is {brand}", "{brand} review") as Q-last, the leading indicator that
  corroboration has started. Define them once in `.Codex/seo-config.yml`.
- **The layered test procedure**, strongest available proxy first: (1) an AI-native search proxy if
  available; (2) corroborating web checks (WebSearch) on the same query recording which source
  CLASSES surface; (3) direct engine probes when capturable (the gold standard). (4) **Never
  fabricate a citation result**: an uncapturable engine is `unverified` for that query, not
  cited/not-cited.
- **Scoring rules**: cited / not-cited / unverified per engine per query. Competitor attribution is
  mandatory: "not cited" is half the data; "not cited, and HERE is who is, and the extractable trait
  that wins it for them" is the actionable half. Track the trend against the prior scorecard; the
  entity signals and presence-class coverage move BEFORE citation does.
- Write the dated scorecard to `.Codex/agent-memory/seo/geo-scorecard-{YYYY-MM-DD}.md` (per-query
  table, entity-signal tracker, presence-class coverage, ranked gap list, verdict).

## 7. Measurement and the honest target

- Leading indicators (they move first): presence in the category's curated lists; count of
  independent non-owned URLs mentioning the brand; review count; Q-id + sameAs completeness.
- AI-referral traffic (chatgpt.com / perplexity.ai referrers) is a lower bound on citation value.
- Rising branded search volume is the lagging proof.
- The honest progression: "present only in owned + directories" to "present in 2+ high-trust
  classes" to "cited for 1+ core query", in that order. Do not claim citation progress from on-page
  work alone.

## Hard rules

- Never fabricate a citation, stat, or review. Every added statistic carries a real year and a real
  primary source; a fabricated number an engine repeats is worse than no number.
- Never add `aggregateRating` to schema without genuine visible third-party reviews.
- Never gate or incentivize positive reviews; invite everyone honestly.
- Via negativa: no separate "big GEO build" (the same authority work IS the GEO work); no
  extractability wave on the long-tail; do not force Wikipedia.

## Learnings

*(append confirmed GEO learnings only after external ground truth: a scorecard movement, a new
citation, a confirmed entity-signal change)*
