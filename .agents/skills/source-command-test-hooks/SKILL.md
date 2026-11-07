---
name: "source-command-test-hooks"
description: "Run the hook-proofs harness and present the PASS/FAIL table for every shipped hook"
---

# source-command-test-hooks

Use this skill when the user asks to run the migrated source command `test-hooks`.

## Command Template

Run the hook-proofs test harness. Every shipped hook has a test file proving three things: it FIRES as documented (realistic payload, exit 0, documented side effect), it BLOCKS as documented (gating hooks only: violating payload, documented block mechanism, documented message), and it NEVER BREAKS THE SESSION (malformed or empty stdin still exits cleanly).

## Steps

### Step 1: Run the harness

```bash
bash .Codex/hooks/tests/run-all.sh
```

With an argument, run a single hook's proof instead:

```bash
bash .Codex/hooks/tests/run-all.sh test-<hook-name>.sh
```

### Step 2: Present the results

Show the user the PASS/FAIL table exactly as the harness printed it, plus the summary line. Do not paraphrase failures away.

### Step 3: On any FAIL

1. Read the failing test file (`.Codex/hooks/tests/test-<name>.sh`) and the hook it tests.
2. Diagnose whether the HOOK regressed or the ENVIRONMENT is missing a dependency (jq, python3).
3. Never weaken a hook's documented behavior to make a test pass. If the hook is genuinely broken, fix the hook, re-run, and log the incident to `.Codex/logs/incident-log.md`.
4. Report the root cause to the user with the exact file and line.

## Notes

- The harness runs against a temporary fixture project directory; it never touches your real `.Codex/logs` or memory files.
- Runs in under 30 seconds, no network access.
- Tests live in `.Codex/hooks/tests/`; the shared assertion library is `_assert.sh`.
