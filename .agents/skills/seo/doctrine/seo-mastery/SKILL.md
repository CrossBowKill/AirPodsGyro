---
user-invocable: false
description: The comprehensive SEO reference doctrine. Technical SEO (crawlability, indexability, Core Web Vitals, structured data, JS rendering), content SEO (intent classification, on-page checklist, topical authority, E-E-A-T, freshness), link building, AI search optimization, and analytics interpretation. Load when a task needs the underlying SEO method rather than a specific workflow, or when calibrating any recommendation against established practice.
version: 2.1.0
---

# SEO Mastery Doctrine

The definitive reference layer beneath the workflow skills. Workflow skills tell you the procedure
for one task; this doctrine holds the method those procedures draw on. Domain-specific facts (your
domain, your keywords, your competitors) come from `CLAUDE.local.md` and
`.Codex/agent-memory/seo/MEMORY.md`, never from this file.

## 1. Technical SEO

### Crawlability
- **robots.txt**: at domain root, one per domain. Block non-content paths (`/admin/`, `/api/`,
  parameter pages). Never block CSS/JS (crawlers need them to render). Reference the sitemap at the
  bottom. Test before deploying changes.
- **XML sitemaps**: max 50,000 URLs / 50MB per file; use an index file above that. `<lastmod>` must
  be honest (fake or static dates erode crawler trust; a build-date lastmod on unchanged pages
  trains Google to distrust the whole signal). Regenerate on every publish, ideally from disk or the
  CMS so the sitemap cannot drift from reality. Resubmit in GSC after every major deploy: the
  resubmit is quota-free and forces a re-read that would otherwise wait roughly two weeks.
- **Crawl budget**: matters most on low-authority domains and 10K+ page sites. Reduce waste (faceted
  navigation, parameter URLs, soft 404s, internal search results). Flatten architecture: every
  important page within 3 clicks of home via STATIC links. Target sub-200ms TTFB.

### Indexability
- Self-referencing absolute canonical on every indexable page. Align canonical, redirect, and
  sitemap signals; conflicts confuse crawlers.
- `noindex` for thank-you pages, internal tools, thin tag pages. Never combine noindex with a
  robots.txt block (the crawler never sees the noindex).
- **Soft-404 prevention**: a non-existent URL must return HTTP 404 (or at minimum a noindex), never
  200 with real content. SPA catch-all rewrites are the classic cause. Verify with
  `curl -s -o /dev/null -w "%{http_code}" https://{domain}/does-not-exist-xyz`.

### Core Web Vitals
| Metric | Good | Poor |
|---|---|---|
| LCP | < 2.5s | > 4.0s |
| INP (lab proxy: TBT) | < 200ms | > 500ms (TBT > 600ms) |
| CLS | < 0.1 | > 0.25 |

- **LCP**: preload the hero image, `fetchpriority="high"` above the fold, inline critical CSS, defer
  non-critical JS, serve the above-the-fold content in the initial HTML, correctly sized images via
  `srcset`.
- **INP/TBT**: break long tasks (>50ms), debounce handlers, keep DOM under ~1500 elements, offload
  heavy computation to workers. The dominant cause on content sites is one oversized JS chunk;
  eliminate it, never preload it (preloading a too-big resource makes LCP worse).
- **CLS**: explicit dimensions on media, reserve space for dynamic content, `font-display: swap`
  with size-adjusted fallbacks, never inject content above existing content after load.
- **The eager-bundle trap** (Vite/webpack content sites): an eager glob or barrel import that inlines
  the entire content corpus into one chunk shipped on every route. Signature: one giant chunk named
  after the content module, far larger than any vendor chunk. Fix: lazy per-item chunks plus a
  metadata-only index for listing pages.

### Structured data
JSON-LD, validated before deploy, monitored in GSC Enhancements. Coverage map: `Article` on posts
(author, dates, publisher), `FAQPage` on Q&A blocks, `HowTo` on tutorials, `BreadcrumbList`
everywhere, `SoftwareApplication`/`Product` with `offers` on product pages, `Organization` with
`sameAs` on the homepage, `CollectionPage`/`ItemList` on listing pages.
- Never mark up content not visible on the page.
- **Never add `aggregateRating` without genuine visible third-party reviews.** A fabricated rating
  is a Google policy violation and a structured-data error waiting to happen. The schema follows the
  reviews, never leads them.
- Schema injected only client-side (a `useEffect`) is invisible to the crawler's first pass. Any
  schema that matters must be in the served or prerendered HTML, and the server and client versions
  must agree.

### Rendering
Best to worst for SEO: SSG, SSR, ISR, dynamic rendering (bridge only), CSR (avoid for anything that
must rank). On a prerendered SPA, hold the invariant: the static HTML must carry the same meta,
content, internal links, and JSON-LD the client would render. Links that exist only in
JS-rendered DOM are discovered only in the scarce render wave; on a low-authority domain that is the
difference between crawled and invisible. Every link that matters goes in the static HTML.

## 2. Content SEO

### Intent classification (classify before creating; mismatched intent will not rank)
| Intent | Signals | Content type | Conversion proximity |
|---|---|---|---|
| Informational | what is, how to, why, guide | Explainer, tutorial | Low (awareness) |
| Commercial | best, top, review, vs, alternative | Comparison, listicle (TABLE-led, never prose) | Medium-high |
| Navigational | brand names, login, pricing | Landing / product page | Medium |
| Transactional | buy, pricing, worth it, free trial | Pricing / decision page | Highest |

### Difficulty tiers for content planning
| Tier | KD | Timeline | Mix for a new domain |
|---|---|---|---|
| Quick wins | 0-35 | 2-8 weeks | 70% |
| Growth | 35-60 | 1-4 months | 25% |
| Authority | 60+ | 6-12+ months | 5% (plant seeds) |

Shift toward 40/40/20 once domain authority is established (roughly DA 15-20+).

### On-page checklist
- **Title**: primary keyword near the start, 50-60 chars, compelling (it is an ad), unique per page,
  year/number modifier where space allows.
- **Meta description**: 140-160 chars, keyword included, pre-answers the query so the snippet earns
  the click. Google rewrites ~70% of them; write a good one anyway.
- **Headings**: one H1; H2s every 200-300 words with secondary keywords where natural; proper
  nesting. Question-format H2s align the passage with the query (and with PAA).
- **First paragraph**: primary keyword in the first 100 words; answer first, elaborate after. No
  throat-clearing.
- **Internal links**: 2-4 contextual links per post, descriptive anchors, bidirectional (update old
  posts to link new ones). Orphan pages struggle regardless of quality; every indexable page needs
  2-3 inbound links minimum.
- **Slug**: lowercase, hyphens, 3-5 words, includes the keyword, permanent (301 if ever changed).

### Topical authority and E-E-A-T
Depth beats breadth: 20 articles on one topic build more authority than 20 topics with one each.
Hub-and-spoke: pillar page (3,000-5,000 words, head/mid-tail target) linked bidirectionally with
focused supporting articles (1,500-2,500 words, long-tail targets). Publish 3-5 spokes first, then
the pillar. E-E-A-T signals: first-hand evidence (screenshots, tested numbers), technical depth,
named authors with real bios and Person schema, cited primary sources, honest limitations, contact
information.

### Freshness
`dateModified` reflects real substantive updates only (no date gaming). Refresh evergreen content
every 6-12 months; refresh the top money pages monthly. Updating an existing ranking page usually
beats publishing a new competing one.

## 3. Link building

**Value hierarchy** (best first): editorial mentions, resource-page links, guest posts, niche
directories, social profiles, community links. Quality bar for a linking domain: DA/DR 30+, niche
relevance, real organic traffic, editorial control.

- **Outreach**: link-worthy content first (data studies, original research, free tools; data-driven
  assets earn roughly 3x the links of opinion content). Personalized, short, one follow-up max.
  Normal benchmarks: 5-15% response, 2-5% placement.
- **Broken link building**: find dead outbound links in your niche, offer your resource as the
  replacement. Higher hit rate because you solve their problem.
- **Anchor distribution** (internal and external): exact match under 30%, partial 30-40%, branded
  10-20%, generic under 10%. Identical anchors everywhere look manipulative.
- **Velocity**: steady growth beats spikes unless tied to a genuine event.
- **Toxic links**: monitor monthly; disavow only as a last resort; earning good links outweighs
  cleaning bad ones.

## 4. AI search optimization

AI Overviews and answer engines select structured, authoritative, extractable, fresh sources.
Universal levers: direct answers in 1-3 sentences immediately under a matching heading, specific
numbers with dates and sources, comparison tables (tables extract at ~81% vs ~23% for prose),
FAQPage/HowTo schema, current `dateModified`.

- **llms.txt**: a root file indexing key pages with one-line descriptions for AI crawlers;
  `llms-full.txt` optionally carries fuller content. Keep pricing and product facts in it accurate;
  a stale fact here gets repeated by engines.
- **AI crawler allowlist** (robots.txt): default stance is allow (GPTBot, ChatGPT-User, Codex-Web,
  PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Amazonbot, FacebookBot, Bytespider).
  Being cited is a distribution channel; blocking makes you invisible to it.

Deeper GEO strategy (citation factors, entity work, presence classes) lives in the `geo-mastery`
doctrine skill.

## 5. Analytics and measurement

**Metrics hierarchy**: impressions, then clicks, then CTR, then position, then conversions. Optimize
in that order: earn impressions, fix CTR, then convert.

**GSC interpretation**:
- Average position is impression-weighted and includes SERP features; compare trends over weeks, not
  days.
- Attribution lag: content changes take 2-8 weeks to show ranking impact (re-crawl, re-index,
  re-evaluate). New pages on new domains: 4-12 weeks. Never react to daily noise; log change dates
  so shifts can be correlated after the lag.
- A page's measurement clock starts at its RE-CRAWL, not its deploy. A change Google never
  re-crawled has not had a fair window.

**Expected CTR by position** (for leak detection): #1 ~27-30%, #2 ~15%, #3 ~11%, #4 ~7%, #5 ~5%,
#6-7 ~3-4%, #8-10 ~2-3%, page 2 under 1%. A page-1 position earning far below its expected CTR is a
snippet problem, not a ranking problem.

**Cannibalization**: two+ URLs ranking for the same query with mediocre split positions. Resolve by
merging (301 the weaker), re-differentiating intent, or canonicalizing; re-point internal links to
the survivor. One intent, one page.

**Verification discipline**: every implemented recommendation is verified for outcome 2-4 weeks
later. A recommendation never checked is waste. Every measurable recommendation writes a
prediction_record at output time (see the Calibration section of
`.Codex/agent-memory/seo/MEMORY.md` and `/seo-learn`), so the day-7 / day-28 pass can grade it.

## Hard rules

- Every recommendation cites a metric, tool, or source. "Improve meta tags" is not a recommendation;
  "shorten the title on /blog/guide from 78 to 58 chars to prevent truncation" is.
- Never fabricate a volume, position, CTR, benchmark, or statistic. Estimates are labeled estimates.
- Never block on missing data: log the gap, proceed with what is available.
- Via negativa: remove tactics with no measurable impact after 90 days. Simpler proven approaches
  beat complex unvalidated ones.

## Learnings

*(agents append confirmed discoveries here after external verification)*
