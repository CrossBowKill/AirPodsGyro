---
name: Claudify hooks directory
description: Every hook in the Claudify base system, what it does, when it fires, and what depends on it.
type: structural-readme
authority: index. Hook behaviour is defined in each script; settings.json wires which hooks fire on which events.
last-reviewed: 2026-10-05
---

# `.claude/hooks/`

This directory holds every shell script the Claude Code harness can invoke as a lifecycle hook, plus three maintenance scripts you run by hand. Hooks are deterministic: they run regardless of model behaviour and cannot be argued with by the agent. They are the system's load-bearing enforcement layer.

If you are an agent reading this because you are about to modify a hook, add a hook, or debug a hook firing: read this index first, then read the script in full. Hook changes propagate on the next event fire. There is no staging.

## Lifecycle order

Events fire in this order during a session:

```
SessionStart (user | compact | resume)
  v
UserPromptSubmit            (every user message)
  v
PreToolUse                  (before every tool call)
  v [tool runs]
PostToolUse                 (after every successful tool call)
PostToolUseFailure          (after every failed tool call)
  v
SubagentStart / SubagentStop (around every subagent)
  v
Stop                        (when the agent finishes a turn)
StopFailure                 (when a Stop-phase hook itself fails)
  v
PreCompact                  (just before context compaction)
PostCompact                 (just after; its output goes to the debug log only)
SessionStart(compact)       (just after; this is the output Claude reads)
```

Configuration lives in `.claude/settings.json`. This README documents what each hook does; `settings.json` documents which event each is wired to. `settings.json` ships once at install and is never overwritten by an update, so new hooks arrive with a paste-in block (see the last section).

## Hook inventory

### Session lifecycle (SessionStart, PreCompact, PostCompact)

| Hook | Event | Purpose |
|---|---|---|
| `session-reset.sh` | `SessionStart(startup, clear)` | Resets stale gate files on every fresh session, re-sets the executable bit on hook scripts, checks agent definitions have frontmatter, ensures required directories, prunes old logs. |
| `check-agent-memory-symmetry.sh` | `SessionStart(startup, clear)` | Verifies every agent in `.claude/agents/` has a matching `.claude/agent-memory/{name}/MEMORY.md`, so the mandatory-reads injection never finds a hole. |
| `pre-compact-handoff.sh` | `PreCompact(auto, manual)` | Writes a substantive auto-handoff to `.claude/logs/.auto-handoff.md` (memory Now section, files touched, latest daily-note Session Handoff) so the post-compaction session resumes from real state. |
| `validate-handoff.sh` | `PreCompact(manual)`, `/safe-clear` last step | Verifies the latest Session Handoff has every required field, its file paths exist, and its Next action is specific. |
| `post-compact.sh` | `PostCompact` | Resets session counters and gate files, and writes the resume details to the debug log. Claude does not read this output. |
| `post-compact-resume.sh` | `SessionStart(compact)` | The resume Claude reads: the latest Session Handoff first, the auto-handoff as gap-filler, and the instruction to continue the Next action without asking. |
| `inject-related-context.sh` | `SessionStart(compact)` | Finds past handoffs from the last 7 days that share topic keywords with today's and adds them to the resume context. |

### Smart memory (UserPromptSubmit)

| Hook | Event | Purpose |
|---|---|---|
| `auto-load-topics.sh` | `UserPromptSubmit` | Scans the message for known topic keywords and surfaces the relevant memory and skill files as a read hint. Reads `topic-routing.yml`. |
| `topic-routing.yml` | (config, not a hook) | Canonical keyword-to-file map used by `auto-load-topics.sh`, `inject-related-context.sh`, `validate-handoff.sh`, `weekly-digest.sh`, and `/safe-clear`. |
| `mandatory-reads.yml` | (config, not a hook) | Agent-name-to-file map used by `subagent-mandatory-reads.sh`. |

### Pre-tool gates (PreToolUse)

| Hook | Event | Purpose |
|---|---|---|
| `guard-bash.sh` | `PreToolUse(Bash)` | Hard block. Catches dangerous bash patterns: recursive deletes on protected paths, force pushes, hard resets, secret leakage. Structured JSON deny. |
| `safe-run.sh` | `PreToolUse(Bash)` | Safety net. Snapshots the files a reversible-destructive command is about to touch so `/undo-bash` can restore them. |
| `backup-before-write.sh` | `PreToolUse(Write, Edit, NotebookEdit)` | Soft action, async. Timestamped backup of the target file into `.claude/backups/`, named after its path in the project, 7-day retention. |
| `completeness-gate.sh` | `PreToolUse(Write, Edit, NotebookEdit)` | Hard block. Refuses incomplete writes to critical system files: provenance on knowledge-base entries, line caps, no deferred-work markers, valid JSON in settings.json, definitive agent definitions. |

### Post-tool tracking (PostToolUse, PostToolUseFailure)

| Hook | Event | Purpose |
|---|---|---|
| `log-changes.sh` | `PostToolUse(Write, Edit, NotebookEdit)` | Appends every file write to `.claude/logs/audit-trail.md`. |
| `track-session-quality.sh` | `PostToolUse(*)` | Maintains tool count, re-read count, and heavy-op count in `.claude/logs/.session-quality-state`. Drives the context tier system. |
| `detect-mcp-change.sh` | `PostToolUse(Write, Edit, NotebookEdit)` | Detects an edit to `.mcp.json`, writes `.claude/logs/.mcp-changed`, logs the event, and returns a systemMessage and additionalContext so Claude and the user both see it that the new servers connect only at the next session start. New in the October 2026 update; needs the settings block below. |
| `log-failures.sh` | `PostToolUseFailure(*)` | Categorizes every tool failure (BUILD, API, FILESYSTEM, NETWORK, PERMISSION, OTHER) with a severity, logs it, and chains to `detect-patterns.sh`. |
| `detect-patterns.sh` | called by `log-failures.sh` | Fingerprints failures in `pattern-counts.json`; past a threshold (CRITICAL 3, ERROR 5, WARN 10) it writes `pattern-alerts.md` and auto-nominates a learning. Needs `jq`, silent without it. |

### Subagent layer (SubagentStart, SubagentStop)

| Hook | Event | Purpose |
|---|---|---|
| `subagent-mandatory-reads.sh` | `SubagentStart` | Injects each subagent's mandatory reads (knowledge base plus its own memory) from `mandatory-reads.yml`, so agents cannot forget the rulebook. |
| `subagent-verdict.sh` | `SubagentStop` | Logs a concise verdict row per finished subagent, so the multi-agent system is self-auditing. |
| `claim-check.sh` | `Stop`, `SubagentStop` | Flags high-signal completion claims ("tests pass", "deployed") that lack command evidence in the turn, so they get proven, not trusted. |

### Stop verdict (Stop, StopFailure)

| Hook | Event | Purpose |
|---|---|---|
| `log-stop-verdict.sh` | `Stop` | Tags every turn with session ID, task type, and model; writes JSONL for trend analysis; activates the quality gate after two blocked verdicts. |
| `check-quality-gate.sh` | `Stop` | Near-zero-cost backstop: blocks the turn when the quality-gate trigger file exists. |
| `log-stopfailure.sh` | `StopFailure` | Logs any Stop-phase hook that failed to run, so the trust layer reports its own failures. |

### Memory ledger helpers (called by commands)

| Hook | Event | Purpose |
|---|---|---|
| `episode-append.sh` | `/wrap-up`, `/safe-clear` | Appends one episode record to `memory/episodes/YYYY-MM.jsonl` and keeps `INDEX.md` capped at 20 lines. |
| `staleness-scan.sh` | `/sync` | Reads `memory/.staleness.json`, compares each registered file's age against its TTL class, reports stale candidates for `/forget`. |

### Maintenance and diagnostics (manual or cron)

| Script | Run | Purpose |
|---|---|---|
| `validate-hooks.sh` | after editing a hook, after an update, when settings.json changes | Static lint: shebang, header comment, executable bit, `bash -n` syntax, every settings.json reference exists on disk, every wired hook has a proof in `tests/`, unwired scripts listed. `--fix` restores executable bits. Exit 1 on any FAIL. |
| `weekly-digest.sh` | weekly, by hand or cron | Aggregates the last 7 days of Session Handoffs from `Daily Notes/` into `memory/weekly-digests/YYYY-MM-DD.md`: Task and Next per day, domain activity from `topic-routing.yml`, every Decisions block. `--dry-run` prints without writing, `--days N` changes the window. |
| `tests/run-all.sh` | `/test-hooks` | The hook-proofs harness. Every shipped hook has a `tests/test-<name>.sh` proving it fires, blocks (gates only), and never breaks the session on malformed stdin. Runs against a temp fixture, never your real logs. |

`validate-hooks.sh` and `tests/run-all.sh` are complementary: the lint proves the scripts are well-formed and wired, the harness proves they behave.

## Anatomy of a hook script

Every hook script has this shape:

```bash
#!/bin/bash
# <Event>(<matcher>) hook: one sentence on what it prevents or accomplishes.
# What it reads, what it writes (always under .claude/logs/), and the failure
# mode (fail-open and exit 0, or a structured deny for gates).

INPUT=$(cat 2>/dev/null)
[ -z "$INPUT" ] && exit 0
# ... extract fields with jq (fall back to Python or grep when absent)
# Python: source lib/python.sh, run claudify_python, then call $CLAUDIFY_PY.
# Never call python3 directly (lint rule 4). CLAUDIFY_PYTHON forces one.
```

The header comment is mandatory. It is the lexical co-location of the hook's WHY next to its WHAT. `validate-hooks.sh` warns on any script without one, and `/audit` treats a missing header as a finding.

## When to add a hook

Add a hook when all three hold:

1. The enforcement must be deterministic (model behaviour cannot be relied on).
2. The trigger maps cleanly to a lifecycle event.
3. The cost of running it on every matching event is acceptable.

Do not add a hook for logic that should run conditionally on agent reasoning (use a skill or an agent's mandatory reads), for one-off checks (run them inline in the relevant command), or for a concern that belongs in one agent's procedure.

## Hook safety rules

1. **Hooks exit zero on the happy path.** A non-zero exit blocks the lifecycle event: deliberate for gates, dangerous for logging hooks. Gates use structured JSON on stdout with exit 0.
2. **Hooks finish inside their timeout.** Slow hooks block the agent on every event. Logging hooks run `async: true`.
3. **Hooks read from stdin only.** Payloads arrive as JSON on stdin.
4. **Hooks write under `.claude/logs/`** (or the memory ledger paths they own), never elsewhere.
5. **Hooks are idempotent.** The harness can re-fire under load.
6. **Hooks never break the session on malformed input.** Every proof file tests this.

## Modifying a hook

1. Edit the script.
2. Run `bash .claude/hooks/validate-hooks.sh`.
3. Run `/test-hooks` (or `bash .claude/hooks/tests/run-all.sh test-<name>.sh`).
4. If either fails, fix the hook or revert. Never weaken a documented behaviour to make a test pass.

To try new hook logic without risk, draft it as a sibling script, wire it in `settings.local.json` rather than `settings.json`, and watch one session before promoting.

## Related

- `.claude/settings.json`: wires hooks to lifecycle events
- `.claude/logs/`: hook output destination
- `.claude/hooks/tests/`: the proof for every shipped hook
- `.claude/agents/auditor.md`: reviews hook-generated logs for patterns
- `CLAUDE.md` section Context Health: the tier system that depends on `track-session-quality.sh` and `log-stop-verdict.sh`
- `CLAUDE.md` section Completeness gates: the file taxonomy `completeness-gate.sh` enforces

## Settings.json additions (October 2026 update)

Updates never touch your `settings.json`, so the one new lifecycle hook in this update is wired by hand. `validate-hooks.sh` and `weekly-digest.sh` are manual scripts and need no settings entry.

Open `.claude/settings.json`, find the `"PostToolUse"` array, and add this object to it (alongside the existing `Write|Edit|NotebookEdit` entry; duplicate matchers are allowed):

```json
{
  "matcher": "Write|Edit|NotebookEdit",
  "hooks": [
    {
      "type": "command",
      "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/detect-mcp-change.sh\"",
      "async": false,
      "timeout": 3,
      "statusMessage": "Checking for MCP config changes..."
    }
  ]
}
```

Then confirm with `bash .claude/hooks/validate-hooks.sh` (the `detect-mcp-change.sh` row should read "wired, proof file present") and `/test-hooks`.

Optional cron line for the weekly digest (Sunday 20:00, adjust the path):

```
0 20 * * 0 CLAUDE_PROJECT_DIR=/path/to/project bash /path/to/project/.claude/hooks/weekly-digest.sh
```
