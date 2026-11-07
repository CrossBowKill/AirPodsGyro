---
user-invocable: false
description: The technical-SEO and web-performance doctrine for making a site fast, crawlable, indexable, and schema-complete, with special depth on low-authority domains and prerendered SPA stacks. Core Web Vitals levers and the eager-bundle trap, crawl budget and hub-and-spoke static linking, de-orphaning, sitemap freshness and the resubmit lever, soft-404 prevention, crawler-visible schema and the server/client agreement rule, honest before/after measurement, and the load-bearing-change discipline. Load when the task is Core Web Vitals, LCP, crawl budget, orphaned pages, soft-404, sitemap freshness, prerender, hydration, or schema coverage.
version: 2.1.0
---

# Technical SEO Mastery Doctrine

The technical half of SEO: make the site fast, make crawlers see everything on the first fetch,
keep the index clean, and ship changes to load-bearing build pipelines safely. This is the strategy
and risk-discipline layer above the `technical-seo-audit`, `core-web-vitals-fix`, and
`xml-sitemap-optimization` workflow skills. Ground every decision in YOUR actual stack: read the
real build pipeline before operationalizing anything here; never generalize from a tutorial.

## 1. The honest hierarchy of impact

On a low-authority domain, technical levers are among the few signals fully in your control, so get
them right, but they are NOT the growth lever (authority is). The typical impact order on a content
site:

1. Fix any single catastrophic performance outlier (usually one oversized JS chunk) that suppresses
   the whole corpus's Core Web Vitals.
2. Stop crawl-budget bleed (soft-404s, orphans, stale sitemap signals) where crawl budget is scarce.
3. Keep schema coverage complete and crawler-visible.
4. Measure before/after honestly.
5. Ship every load-bearing change with the pre-ship audit so a technical fix never breaks the
   rendering invariant or attribution.

Restraint is a feature: do not add technical complexity the authority limiter makes pointless.

## 2. The rendering model and its invariant (prerendered SPAs)

If your site is a client-rendered SPA made crawlable by a build-time prerender, understand the model
before touching anything:

- The prerender writes real static HTML per route: route-correct head tags, the actual content, the
  internal links, and the JSON-LD. A crawler gets complete HTML on the first byte with no JS
  execution.
- If the client mounts with a fresh render (React `createRoot`) rather than hydration, the
  prerendered DOM is discarded and rebuilt on mount. That is a deliberate model ("crawler-visible
  prerender + clean client re-render"), and it means the static markup need not match React's tree
  byte-for-byte.
- **The load-bearing invariant**: the prerendered HTML must carry the same meta, content, internal
  links, and JSON-LD the client would ultimately render. When you change a prerender body renderer
  or schema builder, mirror the change in the corresponding component, and vice versa. Divergence
  means Google sees one thing on first pass and another on re-render, exactly the inconsistency
  that erodes trust on a low-authority domain.
- **Never switch the mount method to hydration casually.** With hydration the static markup must
  match React's tree exactly or React throws mismatch errors and re-renders with a flash. A mount
  switch is a full project with its own pre-ship audit, not a one-line swap.
- **The prerender paradox**: prerendering makes FCP fast (content is in the static HTML), but if the
  client re-render is gated on a huge chunk, the painted content is discarded and the real LCP
  settles many seconds later. A fast FCP is NOT evidence of a healthy page; check LCP and TBT. The
  fix is never to weaken the prerender; it is to make the re-render cheap.

## 3. Core Web Vitals, operationalized

Thresholds: LCP good <2.5s / poor >4.0s; INP good <200ms / poor >500ms (lab proxy TBT good <200ms /
poor >600ms); CLS good <0.1 / poor >0.25.

- **The eager-bundle trap (the #1 anti-pattern on content sites)**: an eager content glob or barrel
  import that inlines the ENTIRE content corpus into one chunk shipped on every content route.
  Signature: one giant chunk named after the content module, several times larger than any vendor
  chunk, loading on every route, with per-route cost growing linearly with corpus size. The fix
  pattern: (1) flip the glob to lazy so each item becomes its own chunk; (2) make the by-slug getter
  async and load only the requested item; (3) build a small eager metadata-only index (slug, title,
  description, dates, tags, reading time, NO body) for listing pages and prev/next, which must
  never pull bodies; (4) update the consumers with a loading state; (5) preserve the prerender
  invariant and test it. Expected result: per-route JS from megabytes to tens of KB; LCP and TBT
  collapse together.
- **The naive trap**: do NOT preload the oversized chunk to "fix" LCP. Preloading a too-big resource
  fetches the bottleneck earlier while it remains the bottleneck and now competes with the critical
  path. ELIMINATE the chunk.
- **LCP levers** beyond the chunk: hero image preload + `fetchpriority="high"`, critical CSS inline,
  defer non-critical JS, above-the-fold content in initial HTML, correctly sized images.
- **TBT/INP**: killing the oversized chunk fixes TBT as a side effect. Secondary levers: gate heavy
  optional scenes (3D, animation) behind interaction + `prefers-reduced-motion`, ensure the LCP
  element is static content so a heavy canvas can never become it, tree-shake icon libraries to
  per-icon imports.
- **CLS**: usually solved by prerendering (layout stable from first paint). Keep it solved: any new
  above-the-fold element reserves its space; never inject content above existing content after
  mount.

## 4. Crawl budget on a low-authority domain

**The crawl-budget signature**: pages deployed, in the sitemap, serving 200, yet GSC reports "URL
unknown to Google". The sitemap is necessary but not sufficient; Google allocates crawl budget by
authority, and a low-authority domain's small budget does not reach deep, weakly-linked pages.
Direct consequence: publishing MORE while Google will not crawl what exists makes things worse. The
technical response is exactly three moves: make the corpus crawl-cheap, keep the sitemap honest,
eliminate crawl waste. The growth response is authority (off-page).

- **Static links beat JS-only links.** Googlebot's fast HTML-parsing wave discovers static links for
  free; links that exist only in JS-rendered DOM wait for the scarce render wave, if it ever comes.
  Every link that matters for crawl or rank goes in the served/prerendered HTML.
- **Hub-and-spoke architecture**: home links the landing + key commercial pages; the landing links
  every topic hub (static cards); each topic hub statically lists EVERY post in its topic; posts
  cross-link siblings. Win condition: every post reachable from home within 3 clicks via STATIC
  links.
- **De-orphaning (standing maintenance)**: an orphan (no hub links to it) is effectively uncrawled
  on a low-budget domain regardless of quality. After any content batch, replicate the
  topic-matching logic over all posts and confirm zero match no topic; when orphans appear, add a
  topic with match rules covering them, in BOTH the client taxonomy and its prerender mirror (the
  agreement rule).

## 5. Indexation

- **Sitemap generation**: generate from disk/CMS on every build so it cannot drift; never a
  hand-maintained list.
- **Honest lastmod**: `lastmod` reflects real content change (e.g. the newest post date for hubs),
  never the build date on unchanged pages; a dishonest lastmod trains Google to distrust the whole
  signal, a real cost on an under-crawled corpus.
- **The resubmit lever**: GSC re-reads a sitemap on a roughly two-week organic cadence. Resubmitting
  it in GSC after every major deploy forces an immediate re-read, is quota-free, and is entirely
  separate from the small daily URL-inspection quota (reserve that for the highest-value individual
  pages).
- **Soft-404 prevention**: SPA catch-all rewrites serving the homepage for any unmatched path let
  Google index infinite junk and steal crawl budget from the real corpus. Fix: route unmatched paths
  to a real 404 page returning HTTP 404 (at minimum a noindex fallback). Verify:
  `curl -s -o /dev/null -w "%{http_code}" https://{domain}/does-not-exist-xyz` returns 404.
- **Canonicals**: self-referencing and absolute on every indexable route; `noindex` on
  purchase-success and utility routes (a success page that could be indexed is the classic miss).
- **robots.txt**: keep AI crawlers allowed (load-bearing for the GEO front); both sitemaps listed.

## 6. Schema coverage (crawler-visible, server/client agreed)

- **The crawler-visible rule**: schema injected only via a client `useEffect` is invisible to
  Google's first pass. Any schema that matters lives in the served/prerendered HTML. Client-injected
  schema is a bug, not a strategy.
- **The agreement rule**: when prerendering schema a component also injects, mirror the exact
  object; a server/client contradiction is worse than either alone.
- **Coverage map**: homepage Organization + SoftwareApplication/Product with `offers`; FAQPage where
  Q&A exists; listing pages CollectionPage + ItemList + BreadcrumbList; posts Article +
  BreadcrumbList (+ FAQPage when an FAQ block exists).
- **The aggregateRating landmine**: never add `aggregateRating` without genuine visible third-party
  reviews; an unsupported rating is a Google-policy violation and a structured-data error generator.
  A Product/SoftwareApplication WITHOUT it is valid. The schema follows the reviews.
- **Auto-generate FAQPage from the content** (an FAQ markdown block the build turns into JSON-LD)
  rather than hand-writing JSON-LD, so the visible content and the schema cannot diverge.

## 7. Measurement (the before/after protocol)

- **PSI API** (free, keyless) is the canonical measurement when its quota allows; **local
  Lighthouse** (`npx lighthouse <url> --only-categories=performance --form-factor=mobile
  --throttling-method=simulate --chrome-flags="--headless=new" --output=json`) uses the same engine
  with PSI's defaults, so its lab numbers are directly comparable. Run against the LIVE site.
- **Protocol**: capture the baseline BEFORE the change (score, LCP, FCP, CLS, TBT, transfer; save
  the JSON), ship, re-measure the SAME page after deploy, state the delta honestly against the
  band thresholds. A change "worked" only if it crosses or materially approaches the band boundary.
- **Lab vs field honesty**: low-traffic sites have no CrUX field data, so there is no live CWV
  ranking signal yet; the honest framing for a pre-emptive fix is "ship before field data records
  the bad number", not "this is penalizing us today".
- Every measurable technical change writes a prediction_record (metric, baseline, predicted value,
  re-check date; CWV re-measures in days, crawl/index effects in weeks).

## 8. The load-bearing-change discipline

Before shipping ANY change that touches a production pipeline (the chunk rewrite, routing/rewrites,
the prerender, the mount method), run the 10-step pre-ship audit: downstream consumers, race
conditions, persisted state (e.g. stale-chunk reload safeguards), scale (per-route cost must be
constant, not corpus-linear), edge cases (missing frontmatter, unknown slug hits the 404 path, empty
topic), rollback cleanliness, the success metric + prediction_record, environment differences
(local vs CI build), idempotency, and compliance/attribution (analytics gating needs an explicit
operator confirm). **Any "not sure" = FLAG it before shipping; multiple = do not ship, investigate.**
Ship the cheap S-effort wins first (soft-404, schema prerender, de-orphan, honest lastmod), then the
risky headline fix as a deliberate, well-tested follow-up. Never bolt a load-bearing change onto the
end of a deep session. Post-deploy: verify live (curl the routes, confirm the prerendered body +
schema + links + status codes), then resubmit the sitemap.

## Hard rules

- Preserve the rendering invariant; mirror prerender and component changes both ways.
- Never fabricate a measurement; every before/after number comes from a real run against the real
  URL, and flat or negative results are reported truthfully.
- Via negativa: do not preload the oversized chunk; do not add pages/sitemaps in response to
  under-crawling; no aggregateRating without real reviews; no hand-written FAQPage JSON-LD; no
  SEO-critical schema via useEffect only; no hand-maintained sitemap; do not disallow AI crawlers;
  do not claim technical work alone will move rankings on a low-authority domain, state the honest
  hierarchy.

## Learnings

*(append confirmed technical learnings only after external ground truth: a measured before/after
that held, a GSC coverage change after a crawl fix, a field-data movement)*
