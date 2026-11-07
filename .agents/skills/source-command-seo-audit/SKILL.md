---
name: "source-command-seo-audit"
description: "Migrated source command `seo-audit`"
---

# source-command-seo-audit

Use this skill when the user asks to run the migrated source command `seo-audit`.

## Command Template

# /seo-audit

**Usage:** `/seo-audit {url}` | `/seo-audit {url} --depth {content|competitive|full}`

Run a tiered SEO audit on a URL or domain.

---

## Trigger Conditions

- User runs `/seo-audit` explicitly
- User asks to "audit", "check SEO", or "run an SEO check" on a URL
- After publishing any new page (auto T2 check)
- Quarterly review cycle (T4 full audit)

---

## Procedure

### Step 1: Determine Audit Tier

| Flag | Tier | Scope |
|------|------|-------|
| (none) | T1 | Quick technical check: 5-10 min |
| `--depth content` | T2 | Content SEO audit: 15-30 min |
| `--depth competitive` | T3 | Competitive analysis: 30-60 min |
| `--depth full` | T4 | Full strategic audit: 60-120 min |

T1 is always run first. T2 builds on T1. T3 builds on T1+T2. T4 builds on all previous tiers.

### Step 2: Invoke seo-agent

Spawn the `seo-agent` with the URL and tier. Pass the full command including flags. Spawn it
synchronously (`run_in_background: false`): Step 3 reviews the agent's output, so the result must
exist before this command continues.

**What to tell the seo-agent:**
```
Run a T{N} SEO audit on {url}.
Read your MEMORY.md first: check for any prior audit data on this domain.
Follow the Tiered Audit System in your instructions for T{N}.
Output the result using the T{N} format specification.
After completing, update your MEMORY.md with the audit results.
```

### Step 3: Independent Review

The seo-agent returns the formatted audit output. Do not judge it yourself: the work should never
mark its own homework. If `.Codex/agents/seo-auditor.md` exists, spawn `seo-auditor` in a fresh
context, synchronously, with the output and these four checks. If it does not exist, run them here
and say the review was not independent.
- All checks completed at the tier level
- Every finding includes a specific remediation
- Metrics cited with sources
- Output format matches tier specification

A reviewer verdict of FAIL, or fewer than half the findings being actionable, means re-run the weak
parts once. A finding that still fails is shown to the user marked `unverified`, and it does not go
on the Task Board. If this domain's last audit also failed review, add a line to
`.Codex/knowledge-nominations.md` naming the repeated problem.

### Step 4: Display Results

Present the full audit output to the user.

For T1/T2: Ask if they want to go deeper (`--depth content`, `--depth competitive`, or `--depth full`).
For T3: Ask if they want a full strategic audit (`--depth full`).
For T4: Offer to build a content calendar or link building roadmap based on the findings.

### Step 5: Update Task Board

If the audit produced FAIL verdicts or critical findings, add the priority fixes to `Task Board.md` under **Today** or **This Week** based on severity.

---

## Output Format Reference

**T1:**
```
SEO AUDIT T1: {PASS|WARN|FAIL} | {domain/page} | {date}
CWV: LCP {X}s | INP {X}ms | CLS {X} | Mobile: {score} | Desktop: {score}
Indexing: {OK|ISSUES} | HTTPS: {OK|ISSUES} | Schema: {type or MISSING}
{Findings if WARN or FAIL}
```

**T2 adds:**
```
Keyword: density {X}% | in-title: {Y/N} | in-H1: {Y/N} | in-URL: {Y/N}
Internal links: {in} / {out} | Cannibalization: {NONE|URLs}
Content: {word count} | Freshness: {age} | Gaps: {count}
```

**T3 adds:**
```
Keyword gaps: {N} | Backlink gap: {N} | SERP features: {owned/available}
Authority: {target} vs. avg competitor {avg} | Content velocity: comparison
```

**T4 adds:**
```
Domain health: {score}/100 | Priority actions ranked by impact
Content calendar, Technical debt, Link targets, Prune candidates
```

---

## Notes

- Always starts at T1 regardless of depth flag, tiers are cumulative
- When the argument is a whole domain rather than one page, and the site's files are in this project,
  also run `/site-integrity` and
  include its verdict: it covers dead internal links, sitemap coverage and duplicate titles across
  every page, which a page-by-page audit cannot
- If GSC is not configured, note the data gap but proceed with available tools
- For T4, expect the session to run long. Do not ask the user to flush context first: native
  auto-compact handles context automatically, and the warm Session Handoff keeps continuity
  (see AGENTS.md Context Health)
- When correlating a traffic or ranking change with algorithm activity, use the dated 2026 Google
  update calendar in `/rank-check` (Investigation Protocol) rather than guessing update dates
