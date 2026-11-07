---
description: Save the method from a finished job as a reusable, client-free playbook - two reuses promote it to a skill, 90 days unused archives it
argument-hint: "[job-type] [short-name]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash(date:*, grep:*, ls:*, mkdir:*, mv:*)
---

Runs when a real job finishes. Turns what just happened into a method the next job can start from. Takes about five minutes. Never copies client data.

`/playbook` records a workflow you describe and turns it into a command. `/capture` is the lighter sibling: it writes down the method from work that already happened, as a draft under `playbooks/`, and lets reuse decide whether it earns promotion.

## When to run

After any of these finish: a client onboarding, a campaign or launch setup, a site or app build, a deploy that needed a fix, a research run, a content batch, or any job over 30 minutes that is likely to happen again.

Skip, and log the skip, when: the job took under 15 minutes, it is a true one-off, or an existing playbook, skill or command already covers it and nothing new was learned.

## Steps

### Step 1: Check what already exists

Search before writing:

```bash
grep -ril "<job keywords>" playbooks .claude/skills .claude/commands
```

- A playbook exists: update it (Step 4) and log a `REUSE` line.
- A skill or command exists and the new learning is a rule: append a nomination to `.claude/knowledge-nominations.md` in its usual format instead, and log `NOMINATED`.
- Otherwise write a new playbook.

### Step 2: Answer five questions from the session record

Use `.claude/logs/audit-trail.md` (files touched this session) and today's daily note. Answer from what happened, not from what was planned.

1. What was the job, in one sentence, without the client's name?
2. What were the steps that actually happened, in order?
3. Where did it go wrong or slow down, and what fixed it?
4. What inputs had to be gathered before starting? (Access, files, approvals.)
5. What should the next run check first?

### Step 3: Strip client details

Replace client names, account ids, sheet URLs, budgets, results and contact details with slots like `{client}`, `{account_id}`, `{budget}`. Then check nothing slipped through: if the project keeps a client registry or a `clients/` folder, compare the draft against every client name and account id in it. Remove any that appear. Never copy a figure from a client's results into a playbook.

### Step 4: Write or update the playbook

Copy `playbooks/_TEMPLATE.md` to `playbooks/<job-type>-<short-name>.md` and fill it. Keep it under 80 lines. Steps must be concrete: file paths, command names, checks. On an update, bump `reuse-count`, set `last-reused` to today, and add the new lesson under "What went wrong last time".

### Step 5: Log it

Append one line to `playbooks/capture-log.md` (create the file with a header row on first use):

```
| YYYY-MM-DD | NEW / UPDATED / REUSE / NOMINATED / SKIPPED | playbook file or reason | job-type |
```

## Promotion and archive

Checked by the auditor during `/audit` and `/system-audit`:
- A playbook with 2 or more `REUSE` lines on different dates is a candidate skill. The auditor checks it still holds no client data, then proposes a skill under the matching `.claude/skills/<category>/` folder. The user approves before the skill is written.
- A playbook with no `REUSE` line in 90 days moves to `playbooks/archive/`. Archived, never deleted; copy it back to restore.

## Output contract

One line: `CAPTURED <file>`, `UPDATED <file>`, `SKIPPED <reason>`, or `NOMINATED <heading>`.
