---
name: "source-command-pulse"
description: "Daily \"did it fire\" check of every automation in .Codex/automations.yml - verdict per job (OK, STALE, FAILING, SILENT, INACTIVE), diffed against yesterday so a new failure is never buried"
---

# source-command-pulse

Use this skill when the user asks to run the migrated source command `pulse`.

## Command Template

Closes the quietest failure there is: a follow-up automation stops, nothing errors loudly, and the damage shows months later as unexplained loss. `/pulse` asks every automation you listed "when did you last run, and did it work?", gives each a verdict, and compares with the previous snapshot so a NEW failure stands out from the known list.

Read-only. This command never fixes, restarts, or re-triggers a job. Fixes go through the normal path (`/red-team` for anything on a money or sending path), and the user's yes, because the jobs run unattended.

## Setup (once)

1. Edit `.Codex/automations.yml`. One entry per job, with `check:` set to how it can be verified: `cron-log` (the job appends a line per run to a log file), `http` (a health URL), `n8n-mcp` (an n8n workflow read through the MCP), or `manual` (you confirm by hand with `last_confirmed`). The shipped file holds commented examples; replace them.
2. Mark anything on a payment, delivery, or sending path `critical: true`.
3. Run `/pulse` once to create the first snapshot. The first run marks everything NEW; the diff starts on the second.

## Steps

### Step 1: Run the script

```bash
python3 .Codex/scripts/pulse-check.py
```

It reads the config, checks every `cron-log`, `http` and `manual` entry itself, diffs against `.Codex/logs/pulse/latest.json`, writes the new snapshot (`latest.json` plus `YYYY-MM-DD.json`), and prints the report. With `--report-only` pass `--dry-run` so no snapshot is written. If it prints `UNCONFIGURED`, do the setup above and stop.

### Step 2: Fill in the n8n entries (the n8n adapter)

Entries with `check: n8n-mcp` come back `UNCHECKED` because the script cannot reach the MCP. For each one, if the n8n MCP server is configured:

1. Load the read-only tools if deferred: `mcp__n8n__n8n_list_workflows`, `mcp__n8n__n8n_executions`, `mcp__n8n__n8n_health_check`. Never call any n8n tool that creates, updates, deletes, activates, tests, or manages credentials.
2. Find the workflow by `workflow_name`. Not found: verdict `SILENT`, reason "not found in n8n (deleted or renamed?)". Found but inactive: `INACTIVE`.
3. List its executions for the last 7 days. Apply the same rules the script uses: zero runs in 7 days is `SILENT`; the last 3 finished runs all errored, or 2 or more errors at 20 percent or more of runs, is `FAILING`; last run older than `expected_interval_hours x grace_factor` is `STALE`; otherwise `OK`.
4. For a `FAILING` workflow, open the latest failed execution and keep the first line of the error. Redact anything that looks like a key, token, or email address before writing it anywhere.
5. Write the verdict, reason and change marker into the entry in `.Codex/logs/pulse/latest.json` (compare with the previous day's file for the marker: NEW-FAILURE, RECOVERED, UNCHANGED).

If the n8n MCP is not configured, leave the entries `UNCHECKED` and say so once in the report. Do not guess.

Two n8n settings affect the result: successful executions must be saved (`EXECUTIONS_DATA_SAVE_ON_SUCCESS` not `none`) or healthy workflows read as SILENT, and execution pruning must keep at least 168 hours of history.

### Step 3: Write the daily note section

Append to today's daily note under `## Pulse`:
- counts by verdict (OK, STALE, FAILING, SILENT, INACTIVE, UNCHECKED)
- every NEW-FAILURE with its reason or redacted error line
- every RECOVERED
- the standing list of known failures (UNCHANGED and still FAILING or SILENT), one line each

If nothing changed, one line: `Pulse: no change, N failing, M silent`.

### Step 4: Escalate the critical ones

If any entry with `critical: true` is NEW-FAILURE, output `RECOMMEND: /red-team` for the fix that will be written, and put it as the first line of your reply. A broken payment or sending path gets fixed under review, not in a hurry.

## Output contract

Three lines: counts by verdict, new failures (names), recoveries (names). Then the `RECOMMEND` line if Step 4 fired.

## Rules

- Read only. Never fix, restart, trigger, or activate anything from this command.
- The script is standard-library python3 and makes network requests only for `http` entries. Pass `--no-network` to skip them (they then read `UNCHECKED`).
- Intended schedule: daily, in the same session as `/start` or from a scheduled task. Creating the scheduled task is the user's decision.
- Snapshots under `.Codex/logs/pulse/` are history. Prune files older than 90 days during `/system-audit`; keep `latest.json`.
