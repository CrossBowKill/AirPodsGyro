---
description: "Check your site before a deploy: dead links, missing images, frontmatter, sitemap and redirects. Needs no extra software. Any FAIL stops an engine deploy."
argument-hint: "[content-folder] [--fix] [--changed-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebFetch
---

# /site-integrity

**Usage:** `/site-integrity` | `/site-integrity src/content/blog` | `/site-integrity --fix` | `/site-integrity --changed-only`

One battery of checks over your content, your sitemap and your redirects, run before anything ships. It uses only Claude Code's own file tools, so it works with no Node, no Python and no build tooling. `/seo-engine`, `/seo-cycle` and `/site-consolidate` run it when `build_and_deploy.integrity_command` is empty in `seo-engine/CONFIG.md`.

If you already have your own scanner, set `integrity_command` and this command stays out of the way unless you run it by hand.

---

## Trigger Conditions

- User runs `/site-integrity` explicitly
- Before any deploy that changes content, when `integrity_command` is empty
- After a batch of redirects, a migration, or a bulk content edit
- A `/seo-watch` sitemap or indexation trigger fires

---

## Step 0: Find what to scan

1. Read `seo-engine/CONFIG.md` for `content.directory`, `content.url_prefix`, `content.frontmatter_fields`, `content.max_title_chars`, `content.meta_description_chars`, `content.internal_link_pattern`, `build_and_deploy.sitemap_in_repo`, `search_console.sitemap_url`.
2. A folder given on the command line overrides `content.directory`.
3. If there is still no content folder, look for one with Glob (`content/`, `src/content/`, `posts/`, `_posts/`, `blog/`, `pages/`). If exactly one holds markdown or MDX files, use it and say so. Otherwise ask the user which folder holds their pages, and stop until they answer.
4. If `content.format` is `cms`, there are no local files to scan. Say so, run only checks 4 and 5 against whatever is reachable, and report the rest as `not scanned, content lives in a CMS`.
5. Look for a redirects file with Glob: `vercel.json`, `netlify.toml`, `_redirects`, `public/_redirects`, `next.config.*`, `astro.config.*`, `.htaccess`, `public/.htaccess`, `nginx*.conf`, `firebase.json`. State which one you used, or `no redirects file found`.
6. Read `.claude/agent-memory/seo/MEMORY.md` `## Calibration` and note every page in a `(pending)` row, whether its by_date is in the future or overdue. Those pages are LOCKED: `--fix` never edits them, and a FAIL on one is reported as HELD. HELD means the fault is real but fixing it now would spoil a measurement, so it does not stop a deploy. It clears once the row is graded.
7. With `--changed-only`, limit checks 1, 2, 3 and 7 to the files named by the caller. Check 6 compares those files with every page. Checks 4 and 5 always run in full, because a broken sitemap or redirect affects the whole site.

Use Grep to pull out links, images and frontmatter lines. Do not Read every page in full: on a large site that burns your session for nothing.

## Step 1: Run the checks

| # | Check | How | Result |
|---|---|---|---|
| 1 | Frontmatter | Every page has a non-empty title, description and date, using the names in `frontmatter_fields`. Title over `max_title_chars`, or description outside `meta_description_chars`, is a length problem. | Missing title: FAIL. Anything else: WARN |
| 2 | Internal links | Every link to a page on your own site (use `internal_link_pattern`, plus root-relative links) resolves to a content file or a known route: a page in `site.commercial_pages`, or a file in a route folder such as `pages/`, `app/` or `src/pages/`. If you cannot tell, it is a WARN, `route not verified`, not a FAIL. A link to a redirect source lands on a hop, so list it separately. | Dead link: FAIL. Link to a redirect source: WARN |
| 3 | Images and assets | Every local image a page references exists on disk. An `http://` image, script or stylesheet on an `https` site is mixed content. | Missing image: FAIL. Mixed content: WARN |
| 4 | Sitemap | Compare the sitemap with your pages. Use `sitemap_in_repo`; if that is empty, fetch `sitemap_url`. Every published page is listed, every listed page exists, and no redirect source, draft or noindex page is listed. Skip this check, stating why, if neither is set. | Mismatch: FAIL |
| 5 | Redirects | Read the redirects file. No destination is also a source (a chain). No loop. Every internal destination resolves. No page you keep is a source. | Chain, loop or dead destination: FAIL |
| 6 | Duplicates | Two pages with the same title, or the same slug in two places. | WARN |
| 7 | Characters | Em dashes in pages, because the engine's own rule forbids them. | WARN |
| 8 | Your checks | If `.claude/agent-memory/seo/integrity-checks.md` exists, run each line in it. One line per check: what to scan, the pattern to look for, FAIL or WARN. | As written |

Check 8 is how the gate grows. When something bad reaches your live site, add a line for it, and it can never ship twice.

## Step 2: Fix, only when asked

Without `--fix`, change nothing.

With `--fix`, make only these changes, and list each one:

- Repoint an internal link from a redirect source to its final destination, following any chain to the end. If the final destination does not exist, leave the link and report it.
- Add a published page to a sitemap file in your repo.
- Remove a redirect source, or a page that does not exist, from a sitemap file in your repo.

Never edit a LOCKED page: report it and leave it. Never write a title, a description, a redirect, or any page copy. Those are decisions, not repairs. Re-run the checks after fixing.

## Step 3: Log and report

Append one row to `.claude/agent-memory/seo/integrity-history.md`, creating it with this header if it is absent:

```markdown
# Site integrity history

| Date | Run | Verdict | Pages | Fail | Warn | Held | Dead links | Missing images | Sitemap mismatches | Redirect problems |
|------|-----|---------|-------|------|------|------|------------|----------------|--------------------|-------------------|
```

Run is `full`, `changed-only` or `fix`. A `fix` row records the state after the repairs. Fail, Warn and Held count individual findings, not checks. The verdict is FAIL if any finding is a FAIL that is not HELD, WARN if any finding is a WARN or HELD, otherwise PASS.

## Output

```
SITE INTEGRITY | {date} | {pages} pages | {VERDICT}
Since last run: fail {old} to {new}, warn {old} to {new}, against the last row of the same Run type | first run

1 Frontmatter:  {pass|warn|fail}  {count and worst examples}
2 Internal links: {pass|warn|fail}
3 Images:       {pass|warn|fail}
4 Sitemap:      {pass|fail|skipped, why}
5 Redirects:    {pass|fail|no redirects file found}
6 Duplicates:   {pass|warn}
7 Characters:   {pass|warn}
8 Your checks:  {n run | none}

Fixed this run (--fix only):
- {file, what changed}

Must fix before deploy:
- {file:line, what is wrong, what to do}

Held, on a locked page:
- {file:line, what is wrong, locked until}

Worth fixing:
- {file:line, what is wrong}

Skipped: {what was not scanned and why}
```

List every FAIL. Cap WARN examples at ten per check and give the full count.

---

## Boundaries

- Read-only unless `--fix` is passed, and then only the three repairs above.
- Never deploys, never commits, never requests indexing.
- Never reports a check as passed when it was skipped. Skipped is its own result.
- A FAIL stops an engine deploy, because a deploy should never add to a broken site. A WARN or a HELD never does.
- Settling-in period: for 14 days from the first row of the history file, a FAIL on a page, sitemap or redirects file this deploy did not change is reported as HELD, with the date the gate turns strict. A FAIL on anything this deploy changed always stops it. From day 15, every FAIL stops the deploy.
- No em dashes in the report or the history file.

## When NOT to run

- As a substitute for a live check. It reads your files, not your deployed site. `/seo-engine` VERIFY and `/seo-audit` cover the live pages.
- On a site with no content files and no sitemap: there is nothing to compare.
