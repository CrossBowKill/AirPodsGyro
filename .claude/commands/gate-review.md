---
description: Weekly review of your approval-gate log - unanswered actions, policy gaps, gate-off events, prompt noise and secret leaks, with proposed rule changes for the user to approve
argument-hint: "[days] [log path]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash(grep:*, wc:*, date:*, ls:*, head:*, tail:*, sort:*, uniq:*)
---

Reviews whatever gate log your project keeps: the record of every action an approval gate asked about, allowed, denied, or ran unchecked. Default window 7 days. Run weekly (Monday) and after any week in which a gate was first installed or a rule changed. Read the `approval-gates` skill first (`.claude/skills/approval-gates/SKILL.md`): it explains why a text-matching gate is a convenience and what a real boundary needs, and this review is how you find out which one you have.

## The log this reads

Default path: `.claude/logs/gate.log`. Pass another path as the second argument. One event per line; the review expects, in any order, a timestamp, a decision word, a kind, the matched action, and a reason. The shipped convention is:

```
2026-10-19T09:14:02Z~ASK~BASH~git push origin main~deploy needs a yes
2026-10-19T09:20:41Z~ALLOW~TOOL~mcp__mail__send_message~approved by user
2026-10-19T11:02:13Z~DENY~READ~.env.production~secret file
2026-10-20T03:00:00Z~GATE-OFF~~~policy file missing
```

Decision words: `ASK` (paused for a human), `ALLOW` (explicit exception or a yes), `DENY` (blocked, no prompt), `GATE-OFF` (the gate could not run, so the call went through unchecked). If your log uses other words, map them in Step 1 and say so in the report.

If no log exists, say so, point at the `approval-gates` skill for what to build, and stop.

## Steps

### Step 1: Count

Read the log for the window. Count lines by decision: ASK, DENY, ALLOW, GATE-OFF. Note the mapping if the words differ.

### Step 2: GATE-OFF lines

Any GATE-OFF line is a defect: a dependency was missing, the policy file was absent, or the hook timed out, so calls ran unchecked. For each, find the cause (missing binary, moved file, timeout) and propose the fix. A gate that can silently turn itself off is not a gate.

### Step 3: DENY on reads

Each DENY on a file read is an attempt to read a secret that used to succeed, or a false positive. List them with the tool and path. If a legitimate path is being caught, propose a narrow ALLOW line above the DENY, never a loosened DENY.

### Step 4: ASK volume

More than about 40 ASK lines a week means the policy is too broad and the human is clicking through. Group ASK lines by reason and list the top 5. For each, say whether it was a real decision point or noise, and propose either a narrower pattern or an ALLOW exception for one specific safe path.

### Step 5: Unattended refusals

Cross-check ASK lines against the run times of your scheduled jobs (`.claude/automations.yml` if you keep one, or the scheduler's own list). An ASK that fired during an unattended run was refused or hung and may have silently broken that job. List each, name the job, and propose either a narrow ALLOW rule agreed with the user or a change to the job so it drafts instead of sends.

### Step 6: Gaps

Compare the week's known external changes (deploys, emails sent, posts published, records updated, workflows edited) from the daily notes against ASK and ALLOW lines. A change with no log line is a path the gate never saw. Propose the rule, or note that the path needs the broker pattern from the skill rather than another regex.

### Step 7: Redaction check

Grep the log for `sk_`, `Bearer `, `token=`, `key=`, `x-api-key`, `ghp_`, and anything shaped like an email address, followed by something other than `[REDACTED]`. Any hit is a leak: report it, propose the masking fix, and recommend rotating the exposed value.

### Step 8: Write the review

Write `.claude/logs/gate-review-YYYY-MM-DD.md` with the counts, the findings from Steps 2 to 7, and the proposed policy lines in a block the user can paste. Append a 5-line summary to today's daily note under `## Gate review`. Do not edit the policy yourself.

## Output contract

Five lines: window and log path, counts (ASK, DENY, ALLOW, GATE-OFF), unattended refusals found, proposed policy changes (count), leaks found (should be 0).

## Rules

- Read-only on the log and the policy. Proposals only; the user applies them.
- Never weaken a DENY rule. Exceptions are ALLOW lines above it, as narrow as possible.
- A week with GATE-OFF lines or a leak gets `RECOMMEND: /red-team` on the gate hook itself.
