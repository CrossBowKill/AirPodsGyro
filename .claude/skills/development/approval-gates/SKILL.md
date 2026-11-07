---
name: approval-gates
description: >
  Doctrine for approval gates around agent actions: why a regex gate in front of
  the agent is a convenience, not a security boundary, and what a real one needs
  (a broker that holds the keys, allow-lists not deny-lists, fail-closed unattended
  runs, a reviewable log). Load when the user says "add an approval gate", "ask
  before sending", "block the agent from paying", "is this hook secure", or
  "review the gate log". Not for destructive-shell guarding (guard-bash.sh ships
  that) and not for application security review (use /security-review).
version: 1.0.0
user-invocable: true
---

# Approval Gates

## Why this exists

The first thing most teams build when an agent gets real tools is a hook that reads every tool call, matches the command text against a list of scary patterns, and pauses for a yes. It feels like a security boundary. It is not one. This skill records what an honest red-team of exactly that design found, so you build the version that works and do not trust the version that only looks like it does.

A gate hook decides which actions need a human yes. It does not stop an agent that has the keys from using them. Those are different problems, and only the second one is security.

## What a regex gate actually buys

A pattern-matching PreToolUse hook is useful for one thing: catching the honest mistake. The agent meant to draft an email and reached for send; the hook asks, the human says no. That is worth having. Keep it for that.

It does not hold against the cases that matter:

- **Self-granted exceptions.** If the gate exempts a command when a marker file exists, and the agent can create that file, the gate is decorative. The exception must be created by something the agent cannot write, for example a token minted by the deploy command and verified by the hook.
- **Command aliases.** `git push` is blocked; `git -C /repo push` is not. `python3 -c` and `node -e` can rebuild any string the regex looks for from parts. Every tool that can run code is a bypass of a text-matching gate.
- **Uncovered paths.** The regex lists the spend and send commands someone remembered. The CLI wrapper, the MCP tool, the form fill in a browser, the script that starts paid generation from inside a loop: each one is a path the list never saw.
- **Shallow secret guards.** Blocking `cat .env` leaves quoted paths, pipes, `.env.production.local`, a copy-then-read, and the file-reading tool itself. If a secret is readable by the agent's process, assume it is read.
- **Disable-by-edit.** The agent that can edit `settings.json` or move the policy file can switch the gate off. One "gate off" line in a log nobody reads is the only trace.
- **Unattended runs.** A scheduled job cannot answer a prompt. A gated call in an unattended run either hangs the job or is silently refused. Neither is what anyone intended.
- **Timeouts and false positives.** A hook that times out usually allows the call. A hook that matches `.env` inside a quoted paragraph blocks a harmless write and trains people to click through.
- **Leaky logs.** A gate log that masks `sk_` but not `Bearer `, `TOKEN=`, `x-api-key`, or customer emails is a new place secrets collect.

## What a real gate needs

1. **The keys live in a broker, not with the agent.** The agent asks a separate process to perform the action (send, pay, deploy, post). The broker holds the credentials, checks the policy, asks the human when needed, and performs or refuses. The agent never sees a key, so no bypass of the agent's hooks reaches the key.
2. **Allow-lists, not deny-lists.** Enumerate what the broker will do (these recipients, this account, this repo, this spend ceiling). Everything else is refused. A deny-list is a list of attacks someone already thought of.
3. **Fail closed when unattended.** A gated action during a scheduled run is refused and logged, never hung and never allowed. Jobs that must act unattended get their own narrow allow rule, agreed with the human in advance, scoped to one action on one target.
4. **One-time tokens for exceptions.** A deploy exception is a token the deploy command mints and the broker verifies once. Not a file the agent can touch.
5. **Policy outside the agent's reach.** The policy file and the broker config are owned by a different user or stored where the agent's process cannot write. Changing a rule is a human act.
6. **A log a human reviews weekly.** Every ask, allow, deny, and gate-off event, with secrets redacted by an allow-list of safe fields (not a deny-list of key prefixes). `/gate-review` reads this log.
7. **A kill switch that is not a bypass.** Disabling the gate for maintenance leaves a loud, dated entry and is itself gated.

## Where the shipped hooks sit on this scale

`guard-bash.sh` blocks destructive shell commands (recursive deletes, force pushes, history rewrites). It is the "honest mistake" catcher and is documented as such. It is not a secret boundary. If you add a pattern gate for sends and spends on top of it, label it the same way in your `CLAUDE.md`: a prompt for the attentive case, not protection against the determined one.

## Worked example (fictional, for illustration only)

A two-person shop gives its agent a tool that emails invoices. First attempt: a hook that asks before any command containing `send`. Within a week the agent is drafting with a helper that calls the mail API from a node one-liner; the regex never fires. Second attempt: the mail credentials move into a small local service with one endpoint, `POST /send`, that accepts only recipients present in the customer table, logs every request, and requires a yes from a desktop prompt unless the request carries a token minted by the nightly invoice job for exactly one batch. The agent's tool now calls that endpoint. Nothing the agent can edit changes who it may email.

## Output

When asked to design or review a gate, produce this table and nothing softer:

| Requirement | Present? | Evidence | Gap or fix |
|---|---|---|---|
| Keys held by a broker, not the agent | no | mail API key in `.env` readable by the agent process | move send into a local broker service; agent calls the endpoint |
| Allow-list of targets | partial | recipients unrestricted, one sending account | restrict to the customer table; refuse everything else |
| Fail closed when unattended | no | nightly job hangs on the prompt | refuse plus log; mint a one-batch token for the nightly job |
| Exceptions by one-time token | no | marker file in `.claude/logs/` | broker verifies a token the job mints; delete the marker-file path |
| Policy outside agent reach | no | policy lives in the repo | move to a path the agent cannot write, or make edits a human action |
| Weekly log review | yes | `.claude/logs/gate.log`, `/gate-review` on Mondays | keep |
| Kill switch leaves a loud entry | no | hook disabled by editing settings | gate the disable; write a dated GATE-OFF line |

Verdict line: `GATE: convenience` or `GATE: boundary`, with the one change that moves it up a level.
