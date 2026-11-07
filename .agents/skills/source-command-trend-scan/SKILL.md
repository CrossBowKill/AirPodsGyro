---
name: "source-command-trend-scan"
description: "Migrated source command `trend-scan`"
---

# source-command-trend-scan

Use this skill when the user asks to run the migrated source command `trend-scan`.

## Command Template

# /trend-scan {brand}

Gather industry trends, platform signals, competitor creative intelligence, and content performance for a brand. Writes insights to a shared trend pool AND to brand memory, so every downstream agent picks them up automatically.

**Shared-pool benefit:** the expensive gather (web research + competitor ad scans + platform signals) runs ONCE per brand and is read by every consumer (content-strategist, content-creator, the newsletter strategist), instead of each agent re-gathering trends independently multiple times per cycle.

**Usage:** `/trend-scan {brand}` or `/trend-scan` (defaults to the Active Brand in `memory.md`)

---

## Steps

### 1. Load brand context

Read `.Codex/agent-memory/content-creator/brand-memories/{brand}.md` to get:
- Industry / niche (from the Identity section)
- Primary platforms (from the Platforms section, or Codex.local.md)
- Recent approved/rejected pieces (from content history)
- Previous trend data if any (from the Trend & Performance Context section)

If the brand file doesn't exist: HALT and tell the user to run `/brand-memory create {brand}` first.

### 2. Gather: industry trends (web search)

Run 3 searches in parallel (use your best available search tool; a semantic/AI-native search tool if one is connected, standard WebSearch otherwise):

1. `"{brand industry} trends {year}"` (broad industry direction)
2. `"{brand niche} content trends {year}"` (content-specific trends)
3. `"{brand category} social media marketing trends"` (platform strategy trends)

Replace `{brand industry}`, `{brand niche}`, `{brand category}` with values from the brand's Identity section.

Extract from results:
- 3-5 most relevant trends (not generic "video is growing"; specific and actionable)
- Each trend: what it is + why it matters for THIS brand's content

### 3. Gather: competitor creative intelligence (optional, if an ads-library tool is available)

If you have access to a competitor ads-library tool (e.g. a Meta Ads Library search tool, or a browser you can point at a public ads library), search:

1. `"{brand niche}"` in the brand's target countries
2. `"{brand industry} {key service}"` for adjacent competitors
3. Specific competitor names if known (from brand memory)

Analyse results for:
- **Long-running ads** (running 30+ days = proven creative; advertisers don't keep paying for what doesn't work)
- **Hook patterns** (what opening lines/visuals are competitors using?)
- **Format patterns** (video vs image vs carousel? Duration? Style?)
- **CTA and copy patterns** (what language, pain points, and value props keep appearing?)

Distill into: "Competitors are doing X. The proven creative pattern is Y. The gap/opportunity is Z."

If no ads-library access: substitute a WebSearch for `"{brand niche} best performing ads {year}"` and note the lower confidence.

### 4. Gather: platform momentum

Run in parallel, scoped to the brand's primary platforms:
1. `"{platform} {niche} what's working {year}"` per primary platform
2. A trend-direction check on the brand's top 2-3 topic keywords (Google Trends via search or browser, if available)

Extract:
- What formats/styles are gaining traction on each platform
- Specific patterns: hook styles, editing techniques, content structures
- Whether key topics are trending up or down (directional signal)

### 5. Gather: content performance (brand memory + platform analytics)

**If the brand has platform analytics access** (an ads API tool, or `/content-learn` grade history in `.Codex/agent-memory/content-analyst/MEMORY.md`):
- Pull the last 30 days of performance. Look for top performers, underperformers, patterns.

**If not:**
- Review the approved/rejected history in brand memory. Note which content types scored highest and what feedback themes appear.
- If no content history yet, skip this step and note "No performance data yet; will populate after first content cycle."

### 6. Write the shared trend pool AND brand memory

Synthesise everything into a single picture, then write it to TWO destinations.

#### 6a. The shared trend pool (read by all agents)

Write to `.Codex/agent-memory/content-creator/trend-pool.md`. The file holds one section per brand; replace only this brand's section, preserve the others. Each section carries a `Last scanned:` freshness stamp:

```markdown
## {brand}
Last scanned: {YYYY-MM-DD}

### Active Trends
- {trend 1: specific trend + why it matters for this brand}
- {trend 2}
- {trend 3}

### Competitor Creative Intelligence
- **Proven formats:** {what long-running competitor ads show works}
- **Hook patterns:** {common opening hooks in the niche}
- **Gap/Opportunity:** {what competitors are NOT doing that this brand could own}

### Platform Signals
- **{platform 1}:** {specific formats/styles/hooks working right now}
- **{platform 2}:** {same}
- **Trend direction:** {rising, stable, or declining interest in the core topics}

### Performance Context
- **Top performer:** {piece ID or description}: {why it worked, key metric}
- **Underperformer:** {piece ID or description}: {why it missed}
- **Pattern:** {what the data suggests about this brand's audience}

### Content Opportunities
1. {specific content idea combining trend + competitor gap + platform signal}
2. {specific content idea}
3. {specific content idea}
```

This is the single source consumed by the content-strategist, the content-creator, and the newsletter strategist. Each reads the pool first and only runs a live top-up if the brand's stamp is more than 3 days old.

#### 6b. Brand memory (backward compatible)

Also write the same synthesis into a `## Trend & Performance Context` section of the brand-memory file (create the section if absent, replace it if present, but ALWAYS preserve existing `### Trend History` table rows; append, never clear).

Add a Trend History row: `| {date} | {top trend} | {pending} | {pending} |`

### 7. Report

Present a brief summary: number of trends identified, top 2-3 actionable insights, the most interesting competitor finding, the 2-3 content opportunities, and a recommendation for which opportunity to pursue first with `/content {brand}`.

Keep it short. The detail lives in the pool and brand memory.

---

## Rules

1. **Specificity over quantity.** 3 specific, actionable trends beat 10 generic ones.
2. **Brand-relevant filtering.** Every trend must pass: "Would this change how we make content for THIS brand?" If no, cut it.
3. **Preserve Trend History.** Only append rows, never clear.
4. **Graceful when empty.** If no performance data exists yet, say so. Never fabricate patterns.
5. **No trend-chasing.** Identify trends, don't prescribe them. The strategist and creator decide whether to use them.
6. **Competitor insight is not copying.** Understand the landscape, find gaps, differentiate. Never replicate competitor creative.
7. **One question max.** If brand context is unclear, ask one clarifying question, then run the scan.
8. **Tool steps are all optional-degradable.** The scan must work with WebSearch alone; every richer source (ads library, analytics API, browser) upgrades quality but is never required.
