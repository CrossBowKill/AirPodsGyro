---
description: "Merge many similar pages into fewer, stronger hub pages. Plans from your evidence, ships small reversible waves, and changes nothing without your yes."
argument-hint: "[plan|wave|status] [section-or-wave-number] [--dry-run]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - WebFetch
  - WebSearch
  - Bash(date:*,cd:*,git:*,curl:*,bash:*,ls:*,grep:*,wc:*,cp:*,mkdir:*,find:*,node:*,npm:*,pnpm:*)
---

# /site-consolidate

**Usage:** `/site-consolidate plan` | `/site-consolidate plan /blog/` | `/site-consolidate wave 1` | `/site-consolidate wave 1 --dry-run` | `/site-consolidate status`

Fewer, stronger pages usually beat many similar ones. When a site has a group of pages that answer nearly the same question, or follow the same outline with a different word swapped in, this command merges them into hub pages, points the old URLs at the right place with permanent redirects, and measures whether it worked.

It has two halves. `plan` reads your evidence and writes a plan, and changes nothing on your site. `wave` ships one part of that plan, after you approve that wave.

Your history is safe by design. Old page files are never deleted, redirects are additions you can remove, and a wave you do not like can be reversed.

---

## Trigger Conditions

- User runs `/site-consolidate` explicitly
- The user asks to merge pages, combine posts, fix cannibalisation at scale, build hub pages, or prune a large content section
- `/content-refresh` or `/topical-map` lists a group of pages marked consolidate
- The cycle brief or `seo-engine/STRATEGY-TEMPLATE.md` do-not-touch list names an over-built cluster

For two pages competing for one query, this is more than you need. Use the `content-optimizer` agent.

---

## What each page can become

| Outcome | Rule | What happens to the URL |
|---|---|---|
| KEEP | Indexed and earning anything: clicks, conversions, external links, or a commercial page. | Nothing. No merge, no redirect, no rewrite. A hub links to it as the deep dive. |
| ABSORB | Not indexed, and a KEEP page already owns the same intent. | Permanent redirect to that page. No new URL. |
| MERGE | Not indexed, and at least three pages share one nameable buyer intent. | Permanent redirect to a new hub. |
| RETIRE | Never earned an impression and holds nothing unique. | Permanent redirect if a same-intent target exists and the URL has any signal (impressions or inbound links). Otherwise 410, or 404 if your host cannot send 410. |
| LOCKED | Named in a `(pending)` Calibration row, whether its by_date is in the future or overdue. A page can be earning and LOCKED; LOCKED wins. | Left out until the row is graded. |

Rules that apply to all of them:

- Group by what the reader is choosing or trying to do, never by tag.
- A KEEP page is protected. Two small edits are allowed: repointing a link whose old target has become a redirect, and adding a contextual link into a hub (wave Step 7). Both wait if the page is LOCKED.
- Where a KEEP page owns the intent, redirect into it. Do not build a hub that competes with it.
- A page with external links pointing at it is never RETIRED with a 410. It gets a permanent redirect to its closest match, and it is flagged in the plan.
- Never send a redirect to a page on a different topic. Search engines treat that as a dead page.
- When the evidence is missing, a page is KEEP. Doubt never retires a page.

---

## Procedure: plan

The plan writes one file, `.claude/agent-memory/seo/consolidation-plan.md`. It does not touch your site.

### Step 1: Load

Read `seo-engine/CONFIG.md`, `seo-engine/CALIBRATION-TABLE.md`, `.claude/agent-memory/seo/MEMORY.md` `## Calibration` (for the lock list), and `.claude/agent-memory/seo/STRATEGY.md` if it exists.

If `consolidation-plan.md` already exists, show its status and ask whether to extend it or start again. Rename an old plan to `consolidation-plan-{date}.md` first. Never overwrite one.

If `content.directory` is empty in CONFIG, ask which folder holds the pages. Scope to the section given on the command line, otherwise ask.

### Step 2: Gather the evidence per URL

For every page in scope, record: URL, title, date, word count, inbound internal links (Grep with `content.internal_link_pattern`), index state, last crawl date, impressions and clicks in the last 90 days, impressions all time, and any external links you know of.

The Search Console data comes from `search_console.access` in CONFIG:

- `api`: run the configured `api_command`.
- `browser`: read it in the operator's logged-in session. Never sign in for them. If a sign-in screen appears, stop and ask.
- `none`: ask the user for three exports from Search Console, and tell them exactly where:
  1. Performance, Search results, Pages tab, set the date range, Export.
  2. Indexing, Pages, then open each reason listed under "Why pages aren't indexed", Export.
  3. Indexing, Pages, "View data about indexed pages", Export.

  Search Console's per-URL inspection tool also works for a short list. Without the third export, a page with impressions that appears on no not-indexed list reads as `indexed (inferred)`: say so in the plan. A not-indexed list outranks impressions: a page can earn a few impressions and still be out of the index.

If you cannot get any of this, write the plan anyway, mark every page `KEEP, no evidence yet`, say what you need, and stop at Step 3. Never guess an index state.

### Step 3: Read a sample and find the pattern

Read 10 to 30 pages from the group in full, or all of them in a smaller group. Answer in the plan:

- What outline do they share? List it.
- How much text is really unique per page? Estimate it, and say it is an estimate.
- What is worth saving from each: the rules, the mistakes list, the decision guide, the numbers that are still true?
- What gets cut: repeated intros, boilerplate sections, repeated closings, anything that cannot be verified today?

### Step 4: Classify every page

Apply the table above. Every page in scope gets exactly one outcome and one line of reasoning. Check that the outcomes add up to the page count, and show the sum.

### Step 5: Design the hubs

For each hub, write: the slug, the title, the one intent it serves, its members (three to ten), the KEEP pages it will link to as deep dives, and its target length. A useful default is a shared spine of 800 to 1,500 words plus 300 to 600 words per member, capped at 7,000. Only write as much as the reader needs.

Check that no hub slug collides with an existing URL, and that no member is the destination of an existing redirect.

### Step 6: Plan the waves

- Wave 0 is a pilot: one hub with real impressions behind it.
- Order the rest by impressions in the last 90 days, then all-time impressions. Hubs with no signal go last. They risk nothing by waiting and gain the most from what you learn.
- ABSORB groups go after the hubs.
- Caps per calendar week: 40 permanent redirects, 10 gone responses, 6 hubs. On a site under 100 pages, use one hub a week. Auditing and fact-checking are usually the real limit.
- On a site with 50 or more pages in scope, hold back one or two ordinary pages as controls. They stay untouched until the Wave 0 read, so you can tell the merge's effect apart from anything else that happened that month.

### Step 7: Write the gates into the plan

- **G1, every wave after the pilot:** the previous wave's sources each return one permanent redirect to a live page, hubs return 200, no hub or KEEP page is a redirect source, the sitemap lists the hubs and none of the sources, `/site-integrity` passes.
- **G2, the pilot read, before wave 1:** 28 days after the pilot hub's first verified crawl, with a hard stop 35 days after it shipped. Hub indexed: continue. Hub crawled but not indexed: stop writing hubs, and handle the remaining pages as ABSORB or RETIRE. Hub never crawled: keep going with the redirects, write shorter hubs, and move the effort to authority.
- **G3, the KEEP check, before every wave:** at least 95% of KEEP and LOCKED pages read as indexed. Under 95% pauses the next wave. Under 90% stops the programme until the operator has looked at it. With fewer than 20 of these pages, one page dropping out pauses the next wave.

### Step 8: Present and stop

Show the outcome counts, the hub table, the wave table, the top three risks, and what you could not verify. Then stop:

> Plan saved to `.claude/agent-memory/seo/consolidation-plan.md`. Nothing on your site has changed. Read it, then run `/site-consolidate wave 0 --dry-run` to see exactly what the pilot would do.

---

## Procedure: wave

Run one wave at a time. `--dry-run` does Steps 1 to 4 as a preview in your reply: it asks for no yes, writes no file, and redirects nothing.

If the plan shows this wave as prepared but not live, resume it: at Step 5 if the gate had not passed, at Step 6 if the operator has since deployed.

### Step 1: Pre-flight

1. Read the plan. Refuse to run a wave out of order, or one whose gates have not been read and passed. The pilot has no earlier gate to pass, so G3 is its only pre-flight gate. State the gate results.
2. Run G3. Then run `/site-integrity` and record the verdict as this wave's starting point. List any FAIL that is already there, and offer to fix it as a separate change first. The operator can fix them or accept them for this wave. A wave never fixes them on a KEEP or LOCKED page.
3. Re-check every member's index state with the same source as the plan. If a member has become indexed, take it out of the wave, leave the page alone, and report it.
4. Re-check the lock list. A LOCKED member waits.
5. Confirm the week's caps hold.
6. List every internal link into each member, including links from earlier hubs. All of them are repointed in this wave.
7. Find how redirects work on this site, and name the file:

| Host or framework | Where redirects live |
|---|---|
| Vercel | `vercel.json`, `redirects` |
| Netlify, Cloudflare Pages | `_redirects` or `netlify.toml` |
| Next.js, Astro | `next.config.*`, `astro.config.*` |
| Apache | `.htaccess` |
| nginx | the site's server block |
| WordPress, Shopify, other CMS | a redirect plugin or the admin panel, which you do by hand |

If redirects live in an admin panel, or you cannot find the mechanism, this command does the rest and hands the operator a two-column list of source and destination. Never invent a config file.

8. Ask for the operator's yes for this wave, showing the member list, the redirect count, any existing redirect that must be repointed, and any FAIL they are accepting from item 2. Without a clear yes, stop.

### Step 2: Protect what exists

If the project uses git, confirm the working tree can be staged by exact path. If it does not, copy every file you are about to change to `.claude/backups/site-consolidate/{date}/`. No backup, no edit.

### Step 3: Write the hub

Use `on-page-engineer` through the Agent tool if `.claude/agents/on-page-engineer.md` exists. Otherwise write it in this session. Either way, the hub follows this structure:

1. A direct answer of 40 to 60 words at the top.
2. One shared spine: what every option in this group has in common. It appears once.
3. A comparison table, with a "choose it when" column.
4. One section per member with only what is distinct about it: its specific rules, its common mistakes, one decision guide.
5. A short FAQ using the wording of real queries from Search Console.
6. A deep dives block linking the KEEP pages for this topic.
7. A block linking the sibling hubs.

Controls:

- A hub that stacks its members' old outlines one after another repeats the problem at a larger size. The per-member sections must not reuse the old template.
- Check every fact against a current primary source at the time of writing: prices, version numbers, product status, whether a company still exists. Anything you cannot verify is cut, not softened. Put source and access date in an HTML comment at the bottom of the page.
- Frontmatter comes from `content.frontmatter_fields`. Today's date for date and modified date. The CTA follows `content.cta_rule`.
- Say nothing on the page about old posts or that this page replaced them. A reader only needs the answer.
- A member with nothing verifiable to say gets one line in the comparison table and no section of its own. Do not pad the hub to reach a target length.

### Step 4: Retire the old URLs

Use `technical-engineer` through the Agent tool if `.claude/agents/technical-engineer.md` exists. Otherwise do it in this session.

1. Add one permanent redirect per member, source to hub, in one isolated change. These are additions. The one existing line you may change is a redirect that ends at a member, directly or through a chain: point it straight at the hub, so nothing chains.
2. Repoint every internal link from Step 1 to the hub, with an anchor to the member's section, in the same change. No internal link may land on a redirect.
3. Leave the old content files where they are, so the change can be reversed. Exclude them from the build, the sitemap and your listing pages, using your project's own way of doing that. If you cannot exclude them, say so and hand the operator the step.
4. For RETIRE pages with no redirect: use a 410 if the host supports one. Otherwise exclude the page so it returns a real 404. Repoint or remove its inbound links first.
5. Check that the sitemap contains each hub and no source.

### Step 5: Gate and ship

Stop here on `--dry-run`, and print the planned changes.

1. Run `build_and_deploy.integrity_command`. If it is empty, follow `.claude/commands/site-integrity.md`. Any FAIL that was not on the starting list the operator accepted in Step 1 stops the wave.
2. Check for chains across the whole redirects file: no destination is also a source, and no source points at a hub that is a source.
3. Run `build_command` if set. A red build never deploys.
4. Stage by exact path. Nothing under `protected_paths`.
5. Deploy with `deploy_command` only. If it is empty, mark the wave `prepared` in the plan, tell the operator exactly what to deploy, and stop. When they have deployed, run this wave again and it resumes at Step 6.

### Step 6: Verify live

Use `seo-engine-auditor` through the Agent tool if `.claude/agents/seo-engine-auditor.md` exists, so a fresh context checks the work. Otherwise do it here. If it returns a BLOCKING FAIL, fix the cause or reverse the wave. Never proceed past one.

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://{domain}{source}"   # one 301 or 308, to the hub
curl -s -o /dev/null -w "%{http_code}\n" "https://{domain}{hub}"                      # 200
```

If curl is missing, WebFetch shows where a URL ends up, but not how many hops it took. Say so in the report.

Confirm: the hub's canonical points at itself, the live sitemap lists the hub and no source, and the hub's content is in the served HTML.

### Step 7: Help the new pages get found

These are operator steps. Hand them over as a short list:

- Resubmit the sitemap in Search Console.
- Request indexing for each new hub, within `search_console.request_indexing_quota_per_day`. Never request a retired source.
- Do not use the Removals tool. It is a temporary hide, and it would spoil the measurement.

Then add two contextual links into each hub from indexed pages that have passed the recrawl gate in `seo-engine/CALIBRATION-TABLE.md`, and update the sibling block on earlier hubs. If those pages are LOCKED, wait.

### Step 8: Write the prediction_records

One row per hub in the Calibration table, family `consolidation`:

- Primary target: the hub reaches indexed within 28 days of its first verified crawl.
- `by_date`: ship date plus 35 days, the hard stop. If it was never crawled by then, the row grades `insufficient-data`.
- Secondary, in the Note: all sources read as redirected by the hard stop.
- Baseline: the members' summed impressions over the last 90 days.

The clock starts at the first verified crawl, not at the deploy. The new hub and the pages that received links are now LOCKED, so nothing re-touches them mid-window.

Update the wave's status in the plan.

---

## Procedure: status

Read the plan and the Calibration table. Show each wave's state, the next gate and its date, the KEEP check if you can read it, and the next command to run.

---

## Reversing a wave

1. Remove that wave's redirect lines.
2. Restore the links and the sitemap from git or from `.claude/backups/site-consolidate/{date}/`.
3. Take the hub out of the sitemap and redirect it to the strongest former member, in the same change, so nothing chains.
4. Deploy through the normal gate and mark the wave `reversed` in the plan.

---

## Output

- `plan`: `.claude/agent-memory/seo/consolidation-plan.md` and a summary. No site file changes.
- `wave`: the hub pages, the redirect and link changes, the prediction_records, a verification report, and the operator's short list.
- `status`: a one-screen state of the programme.

---

## Boundaries

- Nothing changes on the site without the operator's yes for that wave.
- Old content files are never deleted.
- A KEEP page is never merged, redirected or rewritten. A LOCKED page is never edited, and only ever linked to.
- Never makes a hub or a KEEP page a redirect source, and never chains redirects.
- Never submits, requests indexing, or signs in on the operator's behalf.
- Never fabricates a metric or an index state. Missing evidence means KEEP.
- No em dashes in pages, the plan, or commit messages.

## When NOT to run

- During a site migration, a redesign, or a checkout problem. One large change at a time, or you cannot tell what caused what.
- On a page set that is earning and growing. Consolidation is for pages that are not pulling their weight.
- To reach a smaller page count for its own sake. The aim is better answers on fewer URLs.
