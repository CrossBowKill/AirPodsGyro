---
name: "source-command-newsletter-month"
description: "Migrated source command `newsletter-month`"
---

# source-command-newsletter-month

Use this skill when the user asks to run the migrated source command `newsletter-month`.

## Command Template

# /newsletter-month

Batch-produce and schedule a month (~4 issues) of your newsletter end-to-end through the existing per-issue pipeline, behind ONE user approval. This is the batch + scheduling layer on top of `/newsletter`: it chains the same 6 specialist agents (strategist, drafter, prompt-architect, newsletter-auditor, stylist, analyst) plus `build.py` per issue, then stages each validated issue for its send slot in your email service provider (ESP). You run it once a month and approve one batch; everything else is automated.

**Arguments:** `[--count N]` (slots to fill, default 4) · `[--from NNN]` (first issue number, default latest on disk + 1) · `[--dry-run]` (plan only, no production) · `[--skip-schedule]` (produce + validate but stop before the ESP)

---

## Coordination model: disk artifacts are the source of truth, never agent chat

Each issue's state lives on disk under `newsletter/`: `briefs/NNN-brief.md` → `issues/NNN.md` → `drafts/god-tier-NNN-final.md` → `issues/NNN-rendered.html` → `.Codex/logs/verdicts/newsletter-latest.json`. **After every agent phase, gate on the artifact existing and being complete, not on what the agent said.** Agents have been observed to truncate mid-run before writing their final output. When an artifact is missing or short, the agent truncated: re-spawn it, or complete the step inline (you have the same tools).

Because the audit verdict file is a single `newsletter-latest.json`, verify and RECORD each issue's verdict (copy the PASS into the batch table, or archive the JSON to `.Codex/logs/verdicts/newsletter-NNN.json`) immediately after that issue's audit, before the next issue's audit overwrites it.

## Freshness routing

Most newsletter topics are evergreen techniques that are safe to write a month ahead. A minority are timely: tied to a release, a news cycle, or a trend inside a ~30-day window. Evergreen slots are produced now and scheduled. Timely slots are reserved and produced just-in-time (5-7 days before send) so the research is current. This routing is the whole reason to plan rather than blindly batch. When unsure, default evergreen unless a specific recent event is the hook.

## Never auto-publishes

This command SCHEDULES future sends only, and only after the user approves the whole batch. It never sends immediately. A scheduled future send is reversible (unschedule before the send time); an immediate publish is not. The per-issue send gate from `/newsletter send` (audit PASS on disk + render-test PASS) applies to every issue in the batch.

---

## Hard rules (checked at every gate)

1. **Disk artifact is truth.** Verify each phase's file before advancing.
2. **All knowledge-base voice rules apply** to every brief, issue, and god-tier prompt (no em dashes, no banned filler, no marketing clichés; see `.Codex/knowledge-base.md`).
3. **Deliver each issue's prior tease.** Issue N must pay off Issue N-1's "coming next" promise.
4. **God-tier prompt must clear the hard gate**: `drafts/god-tier-NNN-final.md` stamped `status: passed-hard-gate` (3-codebase harness, 4+ on at least 5 of 6 rubric criteria). `build.py` refuses an unvalidated prompt.
5. **Audit must PASS on disk** per issue; default-to-FAIL on any missing or unparseable verdict.
6. **One user approval gate before scheduling.** Present the whole batch's final settings; never click Schedule on any issue until the user says go.
7. **Verify the effective send time in the ESP's timezone setting.** ESP account timezones frequently differ from your audience's timezone; always confirm what local time the scheduled slot resolves to for the reader before confirming.

## Phase 0: Pre-flight (<30s)

- Find the latest issue on disk (`newsletter/issues/NNN.md`, highest NNN) and its rotation type.
- Compute the batch: issue numbers `FROM..FROM+COUNT-1`, their send dates (consecutive weekly slots on the brand's send day; default Tuesday, per brand memory / Codex.local.md), and their types from the brand's rotation (continue from the latest issue's type; `/newsletter next` shows it).
- Verify present: the 6 foundation files (`newsletter/foundations/`), the pipeline agents, `build.py`, `send.js`, `BACKLOG.md`.
- Confirm the most recent issue is already handled so nothing is double-produced.
- **Gate:** batch table computed (date, issue#, type); all inputs present. Print it and continue.

## Phase 1: Plan the month (strategist, one pass)

Spawn the `strategist` once with the full batch (all slots + dates + types). It must:
- Pick each slot's topic from `newsletter/BACKLOG.md` + the rotation, honouring the tease chain.
- **Tag each slot `freshness: evergreen | timely`.**
- Write the month plan to `newsletter/plans/month-{YYYY-MM}.md` (table: date, issue#, type, topic, freshness, one-line rationale) and write the tags back into the matching BACKLOG entries.

**Gate (disk):** the plan file exists with one tagged row per slot; BACKLOG updated. If `--dry-run`, stop here and report the plan.

## Phase 2: Produce evergreen issues (per issue, gated)

For each `evergreen` slot, run the per-issue pipeline (issues are independent, but gate each phase on its disk artifact before the next):

| Step | Agent / tool | Disk artifact gate |
|---|---|---|
| brief | `strategist` (per-issue brief from the plan) | `briefs/NNN-brief.md` complete |
| draft | `drafter` | `issues/NNN.md` present, no unfilled placeholder except the god-prompt body |
| god prompt | `prompt-architect` | `drafts/god-tier-NNN-final.md` stamped `passed-hard-gate`, body pasted into the issue |
| build | `python3 build.py NNN` | `issues/NNN-rendered.html` written, schema checks pass |
| audit | `newsletter-auditor` | verdict JSON parses, `verdict=="PASS"`; record it per issue |
| render-test | `stylist` | structural checks pass, `render-test.sh NNN` screenshots clean |

**Bounded retry:** on audit FAIL, feed the fix list back to the drafter (voice/length) or prompt-architect (prompt), rebuild, re-audit. Max 2 retries, then mark the issue BLOCKED and flag it to the user; never ship a FAIL.

**Truncation recovery (the #1 operational risk):** after each agent, check its artifact. If the prompt-architect truncated, complete inline: run `test-god-prompt.py` on the candidate, test against the reference codebases, score against `GOD-PROMPT-RUBRIC.md`, then write the final with the gate stamp. If the newsletter-auditor truncated, complete inline: run its mechanical scans from the foundation files, judge the semantic + regression checks, write the verdict JSON. Never advance on a missing artifact.

**Gate:** every evergreen issue has rendered HTML + a recorded PASS verdict + a clean render-test.

## Phase 3: Reserve timely slots (just-in-time)

For each `timely` slot, do NOT produce now. Leave it reserved in the month plan with topic, date, and `due: <send date minus 5-7 days>`, and register a production reminder for the due date (a scheduled-task/wakeup tool if one is available; otherwise a dated entry in `Task Board.md` under This Week when the date approaches, plus a line in the month plan the `/start` ritual will surface). The reminder prompt must be self-contained: issue number, type, date, topic seed, "research must be fresh as of this date", and the two commands to run (`/newsletter all NNN`, then `/newsletter-month --from NNN --count 1 --skip-schedule` off, to schedule it).

**Gate:** every timely slot has a reservation + a registered reminder. Report them.

## Phase 4: Stage + schedule in your ESP (skip if `--skip-schedule`)

For each PRODUCED issue, stage a scheduled post in your ESP, then present ONE batch-approval summary and wait for the user's go before any Schedule action is confirmed.

Generic staging steps (any ESP: Beehiiv, Substack, Kit, Mailchimp, Resend broadcasts, etc.):
1. Create a new post/broadcast draft.
2. Insert the rendered HTML (`issues/NNN-rendered.html`) via the ESP's HTML block/import, or the API where your plan allows it (`send.js` documents the API-first path and the manual-paste fallback).
3. Set title/subject = the issue subject; set preview text = the issue's `preview:` field.
4. Confirm audience (all subscribers unless the brand says otherwise) and both email + web where applicable; give the web version an issue-specific meta description.
5. Choose "schedule for later", pick the slot date, set the time, and **verify the effective reader-local send time** (rule 7) before leaving the issue staged.

**Worked example (Beehiiv, manual paste path):** load `issues/NNN-rendered.html` onto the clipboard (`pbcopy < issues/NNN-rendered.html`), click `+ New` in the publication, type `/html` in the body and choose HTML Snippet, paste into the code box (paste, don't type). Set Title, then Next through Audience (All subscribers, Email and web), Email (preview text), Web (slug + meta description), then Review → Schedule → "Schedule for later" → pick the date and time. Beehiiv stores times in the ACCOUNT's timezone: if the account timezone differs from your audience's, enter the offset-adjusted time (e.g. an account set to Central European time needs 11:00 entered for a 10:00 UK send) and confirm the effective time on the review screen. If the time picker rejects typed digits, use its clock dropdown. Do not click the final Schedule until the batch approval.

**Batch approval gate:** print one table (issue#, date, subject, preview text, audience, effective reader-local send time). On the user's explicit go, confirm Schedule for each. If anything misbehaves on an issue, surface it rather than guessing.

## Phase 5: Register the learning loop

For each scheduled issue, register the analyst's day-of-send and day-7 follow-ups (`/newsletter analyse NNN`), via a scheduled-task tool if available, otherwise as dated Task Board entries. Also confirm each issue's `prediction_record` was written at scheduling time (Post-Publish Analyst Contract guard G1; see `/newsletter send`).

**Gate:** two follow-ups + a prediction_record per scheduled issue. Report them.

## Output contract

One table:

| Date | Issue | Title | Type | Freshness | Brief | Draft | God | Build | Audit | Render | Scheduled |
|---|---|---|---|---|---|---|---|---|---|---|---|

Plus: the month-plan path, any BLOCKED issues with reasons, the reserved timely slots with their production dates, and the registered analyst follow-ups.

## Failure modes

| Symptom | Detection | Recovery |
|---|---|---|
| Agent truncated, artifact missing/short | Disk check after the phase | Re-spawn, or finish inline (Phase 2 recovery notes) |
| Audit FAIL | Verdict JSON not PASS | Apply fix list, rebuild, re-audit (max 2), else BLOCK + flag user |
| God-gate blocks build | `build.py` error | The architect did not stamp the final; re-run or complete that step |
| ESP time picker or timezone wrong | Effective time wrong on review | Fix via the ESP's own controls; verify reader-local time; if still wrong, pause and ask the user |
| Topic is actually timely, not evergreen | Strategist tag, or stale research | Move the slot to a Phase 3 reservation; never ship stale |

## When NOT to run

- Mid-week when the current week's issue is unscheduled (handle the live issue first).
- Right after a major release or news event that should reshape the rotation; let the strategist re-plan first.
