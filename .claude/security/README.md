# Security checks

Three commands that help you see what is in your project and what you are about to add to it. They report. You decide. None of them makes a project secure, and a clean result only means the checks listed here found nothing.

## The commands

| Command | What it does | How often |
|---|---|---|
| `/security-sweep` | Looks through this project for keys in files, `.env` files git would pick up, databases and admin panels that may be public, email records for domains you name, keys due for rotation, and what can run on your machine (hooks, MCP servers, permission mode). Writes a dated report to `.claude/security/`. | Monthly, after adding a service or automation, and before sharing a project |
| `/skill-intake` | Vets a third-party skill, plugin, MCP server or hook before you install it. Fetches it into a quarantine folder without running it, pins the exact version, reads every file, gets an independent review, and installs only on your yes. | Every time you add something you did not write, and on every update |
| `/leak-check` | Checks that no client folder names another client. Tells you how to start if you have no `clients/` folder. | Before sending a deliverable, and on any day a client folder changed |

## What they cannot do

- **`/security-sweep`** works from local files and DNS lookups. It cannot see old git history, live cloud settings, who has access to your accounts, or what your services are doing right now. It only finds key formats it has a pattern for. Hooks already in your project run during a sweep like any other session, and it cannot stop them. Anything about public exposure is marked "needs a look", because files cannot prove what is reachable.
- **`/skill-intake`** is a careful read of one version by two reviewers. It cannot prove an item is harmless. It lowers the odds, and it says nothing about later versions.
- **`/leak-check`** finds the exact terms you listed. It misses a client described in other words, or a figure copied without a name. It reads text files, not PDF, Word, PowerPoint or Excel files.

## How your keys are handled

Everything a tool prints in a session goes to the model, the same as any Claude Code session. So `/security-sweep` is written to work from file names, line numbers and counts, never opening `.env` files or printing a value. Reports show a file, a line and a type label. It does no web requests apart from the DNS lookups you ask for, and audit tools only run if you pass `--run-audits`.

These are instructions Claude follows, not a lock. If a value ever shows up in a session, treat that key as exposed and rotate it.

## Files in this folder

- `patterns.tsv`: the key and exposure patterns the sweep uses. Add your own lines at the bottom.
- `sweep-<date>.md`: your reports. They list file paths and key names.
- `keys.md`: your list of key names and rotation dates, started by `/security-sweep`. Names and dates only, never values.
- `skill-intake-log.md`: what you vetted, from where, at which version, and what you decided.

Keep `sweep-*.md` and `keys.md` out of git. The shipped `.gitignore` does this. If you use your own, add those two lines.

## What a real boundary needs

A check or a prompt only catches honest mistakes. A real boundary keeps the keys away from the agent altogether: see the `approval-gates` skill at `.claude/skills/development/approval-gates/SKILL.md`.
