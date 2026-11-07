# Command Index

Auto-generated from the installed command files, one row per file in
`.claude/commands/`. Regenerated at package build time and by the update
procedure, so this catalog always matches the system actually installed.
Do not hand-edit; additions belong in the command files themselves.

95 commands installed.

| Command | Arguments | What it does |
|---|---|---|
| `/ad-build` | "[--scan] [--date=YYYY-MM-DD] [--brief=<id>] [--dry-run]" | Orchestrate the Video Ad Engine end to end. Chains the 7 ad-* agents through the brief-file state machine (video-ads/briefs/{id}.md, status frontmatter) with qu |
| `/ai-visibility` | {domain} | Track brand citations and share-of-voice across AI answer engines, with trend vs last run. |
| `/audit` | "[scope]" | Run the auditor agent against recent work or a specific file/task |
| `/backlink-scan` |  | **Usage:** `/backlink-scan {domain}` |
| `/blog` |  | Long-form blog post production, SEO-aware if Claudify SEO Specialist is also installed. |
| `/brand-memory` |  | Create, inspect or refresh the memory file for a brand. Every content command (`/content`, `/post`, `/thread`, `/blog`, `/trend-scan`, `/ad-build`) reads this f |
| `/brief` | "[project idea]" | Turn a rough idea into a structured project brief |
| `/capture` | "[job-type] [short-name]" | Save the method from a finished job as a reusable, client-free playbook - two reuses promote it to a skill, 90 days unused archives it |
| `/competitive-intel` | "[your product or market]" | Deep competitive analysis - research, compare, strategise |
| `/competitor-seo` |  | **Usage:** `/competitor-seo {competitor domain}` \| `/competitor-seo {competitor domain} --vs {your domain}` |
| `/competitor-teardown` |  | Thin preset over the Claudify Analyst engine: a deep single-competitor (or set) |
| `/content-learn` |  | The social post-publish learning loop. Writes the prediction at publish time, collects real platform outcomes when due, grades predictions, and routes confirmed |
| `/content-refresh` |  | **Usage:** `/content-refresh` \| `/content-refresh {domain}` \| `/content-refresh {url}` |
| `/content-score` |  | **Usage:** `/content-score` then paste content \| `/content-score {url}` to score a live URL |
| `/content` |  | Full content production pipeline: strategy → draft → audit → ship-ready output. |
| `/customer-research` |  | Thin preset over the Claudify Analyst engine: demand, willingness-to-pay, and |
| `/daily-script` | "[setup\|map\|write\|log\|review\|status] {brand} [track] [day] [day-end]" | "Plan and write a daily short-video series. Builds a 30 day map, writes scripts with three hooks each, and keeps a ledger so hooks never repeat." |
| `/debt-map` | "[directory or project]" | Map and prioritise technical debt across your codebase |
| `/design-run` | "[setup \| quick \| profile name] [what to design]" | Take a page, component or ad set from brief to an independent juror verdict, or make one good landing page in a blank folder. No brand system needed. |
| `/drift-detect` | "" | Detect system configuration drift - find stale rules, contradictions, and orphans |
| `/due-diligence` |  | Thin preset over the Claudify Analyst engine: investor-grade diligence on a company |
| `/engine-tune` | "[--dry-run] [--agent=name] [--list]" | "The META-LEARNING pass of the SEO/GEO Engine: the mechanism by which the engine improves its OWN agent prompts, human-gated, from what the LEARN phase measured |
| `/enhance` | "<raw prompt text>" | Transform a raw prompt into an agent-tailored, project-aware enhanced prompt |
| `/feedback` |  | Auto-detection feedback loop. Fires automatically after the user gives a verdict on any content output. Captures learning to brand-memory + content-creator MEMO |
| `/forget` | "" | Governed forgetting - review the staleness scan with the user and archive confirmed-stale memory to the attic (reversible, never deletes) |
| `/gate-review` | "[days] [log path]" | Weekly review of your approval-gate log - unanswered actions, policy gaps, gate-off events, prompt noise and secret leaks, with proposed rule changes for the us |
| `/geo-audit` | {url} [--depth full] | Audit a URL for AI-citation readiness (GEO), with optional full visibility, fan-out, and crawl analysis. |
| `/geo-cycle` | "[--scorecard-only] [--no-nominate] [--dry-run]" | "The GEO sub-loop: citation scorecard + entity signals + extractability audit + a ranked owner-split move list. Tests the priority queries against the AI-answer |
| `/geo-score` | (paste draft) \| {url} | Score a draft or URL for AI-citation readiness before publishing. Returns PUBLISH / REVISE / BLOCK. |
| `/handoff` | "[who you're handing off to]" | Structured session handoff to another person or AI |
| `/intel` | "[optional: specific focus area like 'hooks', 'MCP', 'agent SDK']" | Claude ecosystem intelligence scan that finds new features, patterns, and improvement opportunities for your installed system |
| `/keyword-research` |  | **Usage:** `/keyword-research {topic}` \| `/keyword-research {topic} --domain {domain}` |
| `/launch-post` |  | Launch post production for Product Hunt, Hacker News, or Indie Hackers. |
| `/launch` | "[product or feature to launch]" | Full product launch pipeline - from idea to go-to-market plan |
| `/leak-check` | "[client slug]" | Read-only check that no client folder names another client. Works with or without Python, and explains how to start if you have no clients folder yet |
| `/log-deploy-failure` | "<error message \| paste>" | Log a deployment or CI failure that happened outside Claude's tools, so it enters the failure-pattern and learning pipeline |
| `/market-size` |  | Thin preset over the Claudify Analyst engine: a standalone TAM/SAM/SOM sizing with |
| `/market-watch` |  | Continuous monitoring for a completed Claudify Analyst run: watches the run's own |
| `/memory-consolidate` | "[--dry-run]" | Reflective consolidation pass over memory files. Merges duplicates, expires stale guesses, resolves contradictions, prunes to caps. Conservative and reversible. |
| `/memory-reconcile` | "[--report-only]" | Daily memory reconciliation - read-only health report of the memory layer, then archive finished or stale items out of memory.md into a monthly archive, never d |
| `/migrate-to-2` | "[optional: path to install, defaults to cwd]" | Upgrade an installed Claudify config from 1.0 to 2.0 in place, backup first, never overwrite your customizations |
| `/mutation-gate` | "[file or path to mutate, or blank for the current change]" | Run mutation testing on changed files - reports the mutation SCORE and surviving mutants, PASS/FAIL on a threshold |
| `/newsletter-month` |  | Batch-produce and schedule a month (~4 issues) of your newsletter end-to-end through the existing per-issue pipeline, behind ONE user approval. This is the batc |
| `/newsletter` |  | Newsletter pipeline orchestration. Invokes the `newsletter-orchestrator` agent which coordinates 9 phases (strategy → draft → architect → build → audit → render |
| `/onboard` | "[project directory or repo URL]" | Onboard to a new codebase - architecture scan, key decisions, first tasks |
| `/playbook` | "[name for the playbook]" | Record a workflow and auto-generate a reusable command from it |
| `/post` |  | Single platform post production. Faster than `/content`: skips strategy phase. |
| `/pricing-research` |  | Thin preset over the Claudify Analyst engine: price-point and pricing-model |
| `/proposal` | "[project or client name]" | Generate a client proposal from a project brief |
| `/prove` | "[the claim to prove, or blank for the most recent one]" | Force the loop closed on a completion claim - run the verifier and report real PASS/FAIL with command evidence, or say honestly what could not be verified |
| `/pulse` | "[--report-only]" | Daily "did it fire" check of every automation in .claude/automations.yml - verdict per job (OK, STALE, FAILING, SILENT, INACTIVE), diffed against yesterday so a |
| `/rank-check` |  | **Usage:** `/rank-check` \| `/rank-check {domain}` \| `/rank-check {keyword}` |
| `/readme` |  | High-conversion README + docs production. For OSS projects, indie SaaS, or any product with a GitHub repo. |
| `/recall` | "[query \| domain \| --outcomes]" | Query the episodic ledger - what happened when we touched X, success rate on Y - via grep/tail only, never full-file loads |
| `/red-team` | "[what changed, in one line]" | Independent adversarial pre-ship review of a high-risk change - fresh-context reviewer, numbered findings, SHIP or DO NOT SHIP verdict the builder never overrid |
| `/release` | "[version or date range]" | Generate audience-aware release notes from git history |
| `/report` | "[topic and audience]" | Generate a professional report from data or findings - audience-aware |
| `/repurpose` |  | Atomization with a registry: takes ONE canonical asset and emits platform-native derivatives through the existing platform skills, logging every derivative to ` |
| `/research-audit` |  | The standalone quality gate of the Claudify Analyst engine: an adversarial, |
| `/research-brief` |  | Thin preset over the Claudify Analyst engine: the fast lane for one question. |
| `/research-learn` |  | The LEARN pass of the Claudify Analyst engine: grade every due prediction against |
| `/research-report` |  | Thin preset over the Claudify Analyst engine: compile and render the Conviction |
| `/research-selftune` |  | The meta-loop proposal cycle of the Claudify Analyst engine (loops L2-L7 of the |
| `/research` |  | The Claudify Analyst spine orchestrator. Runs a research question through the epistemic |
| `/retro` | "[time period]" | Sprint retrospective - review what worked, what didn't, improve process |
| `/review` | "[file, directory, or PR]" | Deep code review - security, performance, architecture, and actionable fixes |
| `/safe-clear` | "" | Save session state to disk as a Session Handoff. Optional, for when you want an explicit save point |
| `/security-review` | "[the change, branch, or files to review]" | Adversarial read-only security pass over your git diff - severity-ranked findings with file:line and a concrete fix |
| `/security-sweep` | "[--domains example.com,mail.example.com] [--run-audits]" | Read-only check of this project and its connected services for leaked keys, risky config, stale keys and what can run here. Writes a dated report |
| `/seo-audit` |  | **Usage:** `/seo-audit {url}` \| `/seo-audit {url} --depth {content\|competitive\|full}` |
| `/seo-cycle` | "[--skip-indexing] [--skip-build] [--dry-run]" | "The gated PLANT path of the SEO/GEO Engine: submit queued URLs for indexing (via your browser session or the Search Console API), build the ONE volume-validate |
| `/seo-engine` | "[--sense-only] [--geo] [--dry-run] [--front=keyword\|technical\|geo\|authority]" | "The SEO/GEO Engine spine. Runs the full five-phase loop (SENSE -> DECIDE -> ACT -> VERIFY -> LEARN) over ONE shared sensor pull: parallel sense agents -> the s |
| `/seo-learn` | "[--due-only] [--all] [--dry-run] [--geo]" | "The LEARN pass. Takes day-7 early reads, then grades every prediction that has come due against what really happened. Cheap when nothing is due." |
| `/seo-watch` |  | **Usage:** `/seo-watch` \| `/seo-watch --dry-run` \| `/seo-watch --front=rank\|competitor\|geo\|technical` \| `/seo-watch --establish-baseline` |
| `/site-consolidate` | "[plan\|wave\|status] [section-or-wave-number] [--dry-run]" | "Merge many similar pages into fewer, stronger hub pages. Plans from your evidence, ships small reversible waves, and changes nothing without your yes." |
| `/site-integrity` | "[content-folder] [--fix] [--changed-only]" | "Check your site before a deploy: dead links, missing images, frontmatter, sitemap and redirects. Needs no extra software. Any FAIL stops an engine deploy." |
| `/skill-intake` | "<GitHub repo, https URL or local folder> [commit] [--quarantine <folder>]" | Vet a third-party skill, plugin, MCP server or hook before it reaches your project - quarantine, pin, full read, independent review, install only on your yes |
| `/standup` | "" | Quick daily standup - yesterday, today, blockers from git and tasks |
| `/start` | "" | Start the day - load memory, open task board, ready to work |
| `/status-update` | "" | Re-paste the most recent substantive output in full when the user lost sight of it |
| `/sync` | "" | Mid-day sync - review daily note, update memory, process notes |
| `/system-audit` | "" | Deep infrastructure audit of the entire operating system |
| `/system-map` | "[stop \| status]" | Open a live map of your whole Claudify system in your browser, with health, next steps and your agents, commands and skills. |
| `/test-hooks` | "[hook-name]" | Run the hook-proofs harness and present the PASS/FAIL table for every shipped hook |
| `/test` | "[file or path to test, or blank for the current change]" | Write focused tests for a change, then run them to prove they pass - PASS/FAIL with real evidence |
| `/thread` |  | X / Twitter thread production. Multi-tweet structure with hook tweet + body tweets + closer. |
| `/topical-map` |  | **Usage:** `/topical-map {domain} {topic}` |
| `/trend-radar` |  | Thin preset over the Claudify Analyst engine: an industry trend and regulatory scan |
| `/trend-scan` |  | Gather industry trends, platform signals, competitor creative intelligence, and content performance for a brand. Writes insights to a shared trend pool AND to b |
| `/undo-bash` | "[snapshot-id \| latest \| list]" | List recent safe-run bash snapshots and restore one (or the latest) to its original location |
| `/unstick` | "[what you're stuck on]" | When you're stuck on a problem - get unstuck fast |
| `/utilization` |  | Map what is installed against what has actually been used, then suggest the 3 highest-value unlocks for how this specific user works |
| `/verify` | "[the change, branch, or feature to verify]" | Prove a change works by running the project, not by reading it - PASS/FAIL with real evidence |
| `/which-layer` | "[what you want Claude to do]" | Recommend the right Claude Code layer for a goal (CLAUDE.md, skill, subagent, hook, command, or MCP) and scaffold it |
| `/wrap-up` | "" | End of day - sync memory, clear done list, externalize knowledge, prep tomorrow |
