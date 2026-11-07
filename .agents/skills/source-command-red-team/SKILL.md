---
name: "source-command-red-team"
description: "Independent adversarial pre-ship review of a high-risk change - fresh-context reviewer, numbered findings, SHIP or DO NOT SHIP verdict the builder never overrides"
---

# source-command-red-team

Use this skill when the user asks to run the migrated source command `red-team`.

## Command Template

**Spawn synchronously:** every Agent/Task spawn in this procedure must pass `run_in_background: false`. Subagents default to background since Codex 2.1.198; this command consumes the reviewer's verdict before its next step, so a background spawn would race the verdict.

Run an independent adversarial review on a change before it ships. The reviewer (`change-red-team`) starts in fresh context, never sees the builder's reasoning, assumes the change is broken, and tries to prove it. `/security-review` hunts for exploitable holes in a diff; `/red-team` asks the wider question: how does this change fail in production, and who gets hurt when it does.

## When to run

Before shipping any change that touches:
- payments, checkout, webhooks, invoicing
- download delivery, licence checks, access grants
- anything that sends (email, notifications, posts, messages)
- hooks, `settings.json`, permission gates, approval policies
- unattended jobs (scheduled tasks, cron, heartbeats, background pipelines)
- live customer or client accounts at scale
- data migrations, bulk updates, deletes
- auth, identity, account locks

For everything else use `/audit` or `/review`.

## Steps

### Step 1: Collect the change

Gather what the reviewer needs, nothing more:
- The diff: `git diff` (uncommitted), `git diff --staged`, or `git show HEAD` for the last commit. For non-code changes (settings, policies, config), the list of files changed and their new contents.
- The reason for the change in one sentence, from the argument or the user.

Do NOT pass the builder's reasoning, test notes, or conclusions. The reviewer must form its own view; handing it the builder's confidence defeats the purpose.

### Step 2: Spawn the reviewer in fresh context

Spawn the `change-red-team` subagent with `run_in_background: false`, passing only the diff (or file list), the reason, and the project root. The agent will:
1. Map the blast radius with Grep before looking for bugs.
2. Attack through its lenses: edge cases, error-handling gaps, security, broken invariants, untested paths, production failure modes, and the 10 pre-ship questions (downstream, races, persistence, scale, edges, rollback, measurement, alternative outcomes, concurrency, compliance).
3. Return numbered findings, each with a concrete failure scenario and a `file:line`, plus a SHIP or DO NOT SHIP verdict.

### Step 3: Act on the verdict

- **DO NOT SHIP**: fix every HIGH finding and every "not sure" answer, then run `/red-team` again on the fixed change. Do not argue the findings down in chat. A second DO NOT SHIP on the same change means the design needs the user, not another patch.
- **SHIP**: ship through the project's normal path (`/release`, `/verify`, or the deploy command this project uses). List MEDIUM findings in today's daily note as follow-ups with an owner.

### Step 4: Log one line

Append to today's daily note under `## Red team`:

`[MMDDYY] <change> | <SHIP or DO NOT SHIP> | <n> findings (<h> HIGH, <m> MEDIUM, <l> LOW)`

## Rules

- **The builder never overrides a DO NOT SHIP.** Only the user can, by saying so explicitly for that specific change. Log the override in the daily note with the user's stated reason.
- **The reviewer is read-only.** It never runs deploys, sends, writes, or migrations. If it needs a state change to confirm a finding, the finding stays UNVERIFIED and that is reported.
- **Live outage exception.** For an outage on a money or delivery path, ship the fix first, then run `/red-team` on it straight after and say so in the daily note. The review still happens; it just happens second.
- **One change per review.** Bundling three changes into one review hides the blast radius of each. Split them.

## Output

Present the reviewer's verdict verbatim (CHANGE, BLAST RADIUS, FINDINGS, 10-STEP ANSWERS, VERDICT, REASON), then the one-line daily-note entry you wrote.
