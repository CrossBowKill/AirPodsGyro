---
name: "source-command-log-deploy-failure"
description: "Log a deployment or CI failure that happened outside Codex's tools, so it enters the failure-pattern and learning pipeline"
---

# source-command-log-deploy-failure

Use this skill when the user asks to run the migrated source command `log-deploy-failure`.

## Command Template

Capture a failure that Codex's own hooks could not see (a hosting-platform build error, a CI job failure, a post-deploy crash reported by a user) and feed it into the same pipeline that `log-failures.sh` and `detect-patterns.sh` use for in-session failures. Without this, failures that happen outside the tool system never reach the auditor and never become rules.

## Steps

### Step 1: Get the error

If the argument is an error message, use it. If the argument is `paste` or empty, ask: "Paste the error output from the failed deploy or CI run." Wait for it; do not guess at the error.

### Step 2: Classify

From the error text, extract:

- **Platform**: the hosting or CI system named in the error (infer from the text; if unclear, ask).
- **Type**: `BUILD` (compilation, bundling, type errors), `DEPLOY` (infrastructure, routing, environment, permissions), or `RUNTIME` (crashed after a successful deploy).
- **Root cause**: one sentence stating what went wrong, not what the log said. "Missing environment variable X on the production target" rather than "build failed".

### Step 3: Log to the incident log

Append one line to `.Codex/logs/incident-log.md`, matching the format `log-failures.sh` writes so the auditor can scan both sources together:

```
- `YYYY-MM-DD HH:MM:SS` | FAILURE | CRITICAL | TYPE | manual:PLATFORM | ROOT_CAUSE. Raw: first 200 chars of the error
```

Use `date +"%Y-%m-%d %H:%M:%S"` for the timestamp. Create the file if it does not exist.

### Step 4: Check for a pattern

Read `.Codex/logs/pattern-counts.json` if it exists. Look for an entry whose fingerprint matches this failure (same platform and the same normalised error, ignoring paths, timestamps, and line numbers).

- **Recurring (seen before)**: say so, with the count. Two or more occurrences of the same deploy failure is a process gap, not bad luck: recommend investigating the root cause now, before the next deploy.
- **New**: note it as a first occurrence.

If `jq` is available, record this occurrence so the next one is recognised:

```bash
jq --arg k "manual:PLATFORM:TYPE:ROOT_CAUSE_SLUG" --arg ts "TIMESTAMP" \
  '.[$k] = ((.[$k] // {count:0}) | .count += 1 | .last = $ts)' \
  .Codex/logs/pattern-counts.json > .Codex/logs/pattern-counts.json.tmp \
  && mv .Codex/logs/pattern-counts.json.tmp .Codex/logs/pattern-counts.json
```

(Start the file as `{}` if it does not exist. Skip this step silently when `jq` is absent.)

### Step 5: Nominate the learning

Append to the Pending section of `.Codex/knowledge-nominations.md`:

```
- [MMDDYY] deploy-failure: ROOT_CAUSE on PLATFORM (TYPE). Fix: <what resolved it, or "pending investigation">. Prevention: <the check that would have caught it before deploy, if known>. | Evidence: .Codex/logs/incident-log.md, manual capture
```

If the user already knows the fix, include it. The auditor promotes nominations with a confirmed fix and a prevention check; a nomination with neither stays pending.

### Step 6: Confirm

Tell the user, in three lines:
- What was logged (the incident line).
- Whether this is a first occurrence or a recurrence (with count).
- That the nomination will be reviewed at the next `/audit`, and, if the fix is known, whether a pre-deploy check (a `/verify` step, a hook, or a CI gate) should be added now rather than waiting.

## When to run

- A hosting-platform build or deploy fails and the error arrived by dashboard, email, or chat, not through a tool Codex ran.
- A CI job fails on a push Codex made.
- A user or monitor reports a crash after a deploy that looked successful.
- Before `/retro`, so the week's deploy failures are in the log the retrospective reads.
