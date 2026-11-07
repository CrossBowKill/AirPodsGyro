---
user-invocable: false
description: The SEO blog production doctrine, the standards layer for writing posts that rank on Google AND get cited by AI answer engines. The mandatory 5-step pre-write research protocol (keyword validation, SERP analysis, overlap check, internal-link plan, content brief), writing standards, GEO/AEO on-page rules, the pre-publish quality gate, and the bi-weekly post-publish feedback loop. Load when writing, planning, or reviewing an SEO blog post.
version: 2.1.0
---

# SEO Blog Doctrine

The production standards for every SEO blog post: what must happen before a post is written, how it
is written, what gates it before publish, and how its performance feeds back into the system. The
domain, keyword targets, and published-posts registry live in `CLAUDE.local.md`, the keyword maps at
`.claude/agent-memory/seo/keyword-maps/`, and the site's own content registry; this file is the
method.

## 1. Keyword strategy (time-layered for a growing domain)

| Tier | KD | Timeline | Purpose |
|---|---|---|---|
| Quick wins | 0-35 | weeks | Build authority, early traffic |
| Growth | 35-60 | months | Compound on authority, buying intent |
| Authority builders | 60+ | 6-12 months | Long-term positioning |

New-domain mix: 70/25/5, shifting to 40/40/20 once domain authority establishes. Maintain a
priority-ordered keyword-targets table (keyword, est. volume, KD, tier, status) and update status on
publish. Prefer planned keywords over ad-hoc topics; remove keywords proven unviable.

**Content type follows intent** (mismatched intent will not rank): informational = explainer/guide;
commercial "best X" = table-led listicle; "X vs Y" = head-to-head; how-to = tutorial;
problem-aware "X not working" = troubleshooting. Rotate types; five listicles in a row reads
unnatural to readers and to Google.

## 2. The mandatory 5-step pre-write research protocol

**HARD RULE: no post is written without all 5 steps. If any step is skipped, the post is not
written. Quality over quantity.**

1. **Keyword validation.** Verify search demand exists: keyword-tool data, live autocomplete, a
   People Also Ask presence, or GSC queries earning impressions without clicks (a content gap).
   Minimum bar: evidence of demand. No posts for keywords nobody searches.
2. **SERP analysis.** Google the primary keyword; note the top 5 (domain authority, content type,
   word count); identify what ALL top results cover (must-include), the angle none cover (your
   differentiation), and the format the SERP rewards (match it). Record a 3-line note at the top of
   the post file as a comment: `<!-- SERP: [top competitor], [gap found], [our angle] -->`.
3. **Overlap check.** Search the published-posts registry for any post targeting the same or a
   near-identical keyword. If overlap exists, UPDATE the existing post instead (consolidation beats
   fragmentation); check cannibalization risk between near-synonym targets.
4. **Internal-link plan.** Before writing, name 3 existing posts to link TO from the new post and 2
   existing posts to link FROM (edit them after publishing). Bidirectional web, never orphaned
   content.
5. **Content brief.** Five lines before drafting: keyword + volume + KD; SERP gap; angle; format;
   links to/from.

## 3. Writing standards

**Structure**: title with the primary keyword, under 60 chars including any brand suffix, no
clickbait. Meta description 140-160 chars, keyword included, written to earn the click. First
paragraph states the answer/value immediately with the keyword, no throat-clearing. H2 every
200-300 words with secondary keywords where natural. 1,500-2,500 words (shorter is thin, longer is
padding, except money pages built for depth per the keyword doctrine). Paragraphs 2-4 sentences.

**Voice**: technical but accessible; honest about downsides (credibility beats sales pitch); zero
marketing speak ("revolutionary", "game-changing" = instant credibility loss); practical (real
commands, real examples); confident ("use X when Y", never "might potentially").

**Internal linking**: 2-4 contextually relevant links per post to existing posts, descriptive
anchors, plus links to the key converting pages (pricing/features).

**CTAs**: one subtle contextual mid-article CTA; one clear direct end CTA to the converting page.
Never pushy; the content sells by demonstrating expertise. No em dashes anywhere in any output.

**Technical**: slug lowercase-hyphenated, 3-5 words, matches the keyword; 3-4 reused tags;
consistent canonical host form (pick www or apex and one trailing-slash rule, everywhere).

## 4. GEO / answer-engine rules (every post)

Every page is built to be CITED by AI answer engines, not just to rank:

- **BLUF (answer-first)**: the first 100 words directly answer the core query, with the target
  phrase, before any context. Engines lift the opening verbatim.
- **Tables**: any "best X", "vs", or pricing page leads with a clean table near the top.
- **FAQPage**: a "Frequently asked questions" section with 3+ real question-format Q&A on every
  commercial and informational page, emitted as FAQPage JSON-LD by the build (never hand-written).
- **Visible author + current date**: a real author and a fresh `dateModified` in frontmatter, plus
  the year in the title where the query is year-sensitive.
- **Entity clarity**: name the product, the category, and the real alternatives plainly; keep the
  site-wide Organization schema (with `sameAs`) disambiguating your brand.
- **Factual discipline (HARD rule)**: never invent statistics, benchmark scores, prices, or dates. A
  fabricated number an AI engine repeats is worse than no number. Verified facts with a named source
  or stay qualitative.

## 5. The pre-publish quality gate

Verify all before publishing:
1. Primary keyword in title, meta description, first paragraph, at least one H2
2. Meta description 140-160 chars; title under 60 chars including suffix
3. Word count in band for the post's role
4. 3+ internal links to existing posts (from step 4 of the protocol)
5. At least one table, code block, or structured comparison
6. FAQ section with 3+ questions (schema auto-generated)
7. Mid-article + end CTA
8. No overlap with published posts (verified in step 3)
9. Content-brief comment present at the top of the file
10. Sitemap regenerated; any prerendered meta regenerated
11. Live URL returns 200 after deploy
12. A prediction_record written for the post (target query, predicted indexation/position window,
    baseline, re-check date) per the Calibration spec in `.claude/agent-memory/seo/MEMORY.md`

## 6. The post-publish feedback loop (bi-weekly)

**Every 2 weeks, review blog performance and feed learnings back:**

1. **GSC review**, sorted by impressions: posts ranking 5-20 (striking distance, strengthen these
   FIRST); high impressions + low CTR (rewrite title/meta); 0 impressions after 14 days (check
   indexed; if indexed, the keyword was wrong, reassess); new queries with no matching post
   (opportunities).
2. **Update underperformers**: striking-distance posts get 200-500 words, stronger keyword usage,
   internal links; low-CTR posts get a title/meta rewrite plus a re-index request; zero-impression
   indexed posts get an angle pivot or retirement.
3. **Record patterns** in `.claude/agent-memory/seo/MEMORY.md`: which content types rank fastest,
   which length band performs, which keywords convert (cross-reference your attribution data).
4. **Feed the next batch**: the next posts address the gaps found; the keyword-targets table gains
   the new opportunities and loses the disproven ones.

Continuous signals worth capturing: new GSC queries for your domain; competitor new pages
(quarterly); your platform/category changelog (new features = new keyword opportunities); real user
questions from support (genuine search intent).

**Link-earning formats to prefer** when choosing among equal topics: "what is X" explainers for
trending terms, data-driven comparisons, original frameworks, tool roundups (included tools link
back).

## Hard rules

- The 5-step protocol is non-negotiable; skipped step = no post.
- Zero fabricated numbers; zero em dashes; no unverifiable claims.
- Consolidation beats fragmentation: overlap = update the existing post.
- Every published post gets a prediction_record and a scheduled re-check; the bi-weekly loop is not
  optional.

## Learnings

*(append confirmed production learnings only after external ground truth: a post's day-14/28 GSC
outcome, a confirmed format-performance pattern)*
