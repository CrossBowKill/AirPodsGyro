---
description: Query the episodic ledger - what happened when we touched X, success rate on Y - via grep/tail only, never full-file loads
argument-hint: "[query | domain | --outcomes]"
allowed-tools:
  - Read
  - Bash(grep:*)
  - Bash(tail:*)
  - Bash(head:*)
  - Bash(wc:*)
  - Bash(ls:*)
  - Bash(date:*)
---

Query the episodic ledger (memory tier 7). Episodes live as one-JSON-object-per-line records in `memory/episodes/YYYY-MM.jsonl`, written by `episode-append.sh` at `/wrap-up` and `/safe-clear`. This command answers questions like "what happened the last times we touched auth", "how often do deploy sessions fail", "what did we decide about the billing migration".

**Token-frugal load policy (HARD RULE):** NEVER load a full episode `.jsonl` file into context. No `Read` on the JSONL files, no `cat`. Query them with `grep` and `tail`, always capped with `head`. The ONLY episode file that may be loaded whole is `memory/episodes/INDEX.md`, which the writer script caps at 20 lines for exactly this reason.

## Steps

### Step 1: Orient from the index

Read `memory/episodes/INDEX.md` (20-line cap, safe to load). This gives the recent episodes at a glance and often answers the question outright. If the file is missing or empty, report that no episodes have been recorded yet and stop.

### Step 2: Parse the argument

- **No argument**: summarize the INDEX (recent activity, outcome mix) and stop. Do not touch the JSONL files.
- **`--outcomes`**: overall outcome statistics (Step 4).
- **Anything else**: a query term (a domain label, a file path fragment, a topic word). Run the targeted grep (Step 3).

### Step 3: Targeted query (grep only, capped)

Search newest month first, then earlier months only if needed:

```bash
ls memory/episodes/*.jsonl 2>/dev/null | tail -3
grep -i "QUERY" memory/episodes/YYYY-MM.jsonl 2>/dev/null | tail -10
```

- Cap every pipeline at 10 matching lines (`tail -10` or `head -10`). Ten episodes answer any recall question; more is context burn.
- Each matching line is one complete episode record: ts, task, outcome, domain, files, decision, lesson. Summarize the matches for the user: what happened, what was decided, any lessons.
- Match against domain, task, decision, and file paths at once (the grep runs over the whole line, which is the point of one-line records).
- If a query spans months, run the same grep per month file, newest first, and stop as soon as 10 total matches are found.

### Step 4: Outcome statistics (--outcomes or "success rate on X")

Counts only, never content:

```bash
grep -c '"outcome":"success"' memory/episodes/*.jsonl 2>/dev/null
grep -c '"outcome":"partial"' memory/episodes/*.jsonl 2>/dev/null
grep -c '"outcome":"fail"' memory/episodes/*.jsonl 2>/dev/null
```

For a scoped rate ("success rate on deploys"), filter first, then count:

```bash
grep -i "deploy" memory/episodes/*.jsonl 2>/dev/null | grep -c '"outcome":"success"'
grep -i "deploy" memory/episodes/*.jsonl 2>/dev/null | wc -l
```

Report the rate as a fraction and a percentage with the sample size (for example "4 of 6 deploy episodes succeeded, 67%, n=6"). At n under 3, say the sample is too small to mean anything.

### Step 5: Answer

Give the user a direct answer built from the matches: what happened, when, the outcome, the decision made, and any recorded lesson. Cite the month file(s) queried. If the ledger has no matches, say so plainly; do not pad with guesses.

## Why this design

Episodes are append-only history: valuable to query, poisonous to bulk-load. A month of daily episodes is thousands of tokens that would displace working context for a question that grep answers in one line. The 20-line INDEX gives ambient awareness; the JSONL files stay on disk as a grep-able archive. That split is what makes an ever-growing ledger safe to ship.
