---
name: "source-command-engine-tune"
description: "The META-LEARNING pass of the SEO/GEO Engine: the mechanism by which the engine improves its OWN agent prompts, human-gated, from what the LEARN phase measured. Drains the seo-analyst's PROPOSE_AGENT_REVISION queue, fires the fresh-context seo-engine-auditor to adversarially validate each proposal, presents every auditor-passed proposal to you for explicit per-proposal approval (never auto-applied), then on your go backs up and applies the surgical prompt edit and logs a META-PREDICTION for a re-check. Proposes; you dispose; a change that does not measurably help is rolled back. Tunes agent prompts only. Ships no SEO change."
---

# source-command-engine-tune

Use this skill when the user asks to run the migrated source command `engine-tune`.

## Command Template

# /engine-tune

The engine already senses, decides, acts, verifies, and learns. When the LEARN pass finds that the
same agent keeps producing the same class of graded miss, the seo-analyst appends a
`PROPOSE_AGENT_REVISION` to a queue: "this agent's prompt has a weakness, here is the evidence, here
is the surgical fix." `/engine-tune` turns that proposal into a better agent, SAFELY. It is the one
loop above LEARN: LEARN makes the decisions sharper; `/engine-tune` makes the agents sharper.

This is a self-modifying system, so the safety is the point. The engine NEVER autonomously rewrites
its own agents. The analyst PROPOSES, the fresh-context auditor VALIDATES, you DISPOSE (explicit
per-proposal approval), the change is BACKED UP before it is applied, MEASURED by a meta-prediction,
and REVERSIBLE (rolled back if it did not help).

**Mandatory reads:** `seo-engine/README.md` (Laws 2, 4, 6), `.Codex/agents/seo-analyst.md` (step
6.5, the emitter), `.Codex/agents/seo-engine-auditor.md` (PROPOSAL mode, the validator),
`AGENTS.md` (the nominate, validate, gate, apply model this command applies to prompts).

## The shared contract

- **Queue:** `.Codex/agent-memory/seo/agent-revision-nominations.md`. The analyst appends; this
  command drains and marks Status.
- **Proposal block shape:**
  ```markdown
  ## PROPOSE_AGENT_REVISION {YYYY-MM-DD}, {target-agent}
  - Target agent: .Codex/agents/{agent}.md
  - Weakness: {the specific prompt weakness the graded misses expose}
  - Evidence (n>=3): {the Calibration rows or audit rows that prove it, with the count}
  - Proposed change: {the exact section + the before/after intent + why it fixes the weakness}
  - Expected improvement: {the measurable outcome}
  - Status: PENDING
  ```
- **Log:** `.Codex/agent-memory/seo/agent-revision-log.md`: every APPLIED revision with its
  before/after, evidence, META-PREDICTION, and later outcome. Created on the first apply.

## The loop

```
[0 LOAD] -> [1 VALIDATE (auditor)] -> [2 GATE (you, mandatory)] -> [3 APPLY (backup + edit + verify + log)] -> [4 MEASURE (re-check, rollback if it did not help)]
```

## Flags

| Flag | Effect |
|---|---|
| `--dry-run` | Phases 0-1 only: drain and validate, report what WOULD be gated, change nothing, do not open the gate. |
| `--agent=name` | Scope the pass to one target agent's proposals. |
| `--list` | Print the PENDING queue and stop. Read-only. |

---

## Phase 0, LOAD the queue

### 0.1 Pre-flight
```bash
date '+%Y-%m-%d'
QUEUE=".Codex/agent-memory/seo/agent-revision-nominations.md"
LOG=".Codex/agent-memory/seo/agent-revision-log.md"
ls -la "$QUEUE" 2>/dev/null || echo "QUEUE absent: nothing to tune (the analyst appends here during LEARN)."
ls -la "$LOG" 2>/dev/null || echo "LOG absent: created on the first applied revision."
ls -la .Codex/agents/seo-engine-auditor.md 2>/dev/null && echo "VALIDATOR present" || echo "VALIDATOR ABSENT: HALT"
mkdir -p .Codex/backups/agent-revisions
```
Queue absent or empty: stop cleanly. Validator absent: HALT; an agent-prompt change is never applied
without the adversarial gate, and there is no inline fallback here.

### 0.2 Build the PENDING set
Parse every `## PROPOSE_AGENT_REVISION` block. PENDING = `Status: PENDING` (intersected with
`--agent=` if given). Skip APPLIED, REJECTED, HELD. For each PENDING block confirm it is well-formed:
the target file exists, the Evidence line carries an explicit `n=` count, the Proposed change names a
section and a concrete edit. Malformed: mark `Status: HELD (malformed, {reason})`, surface it, do not
proceed with it.

### 0.3 The cheap exit and `--list`
`--list`: print each PENDING proposal (target, weakness, n, expected improvement, well-formed?) and
stop. Empty PENDING set: report "no pending agent revisions" and stop. This is the common outcome; an
agent revision needs a graded pattern at n>=3 first.

---

## Phase 1, VALIDATE each proposal (the auditor, adversarially)

For EACH well-formed PENDING proposal, **invoke `seo-engine-auditor`** in PROPOSAL mode:

```
Adversarially VALIDATE this proposed agent-prompt revision (do not apply it, do not audit any ship).
Proposal: {the block}.
Validate on THREE axes and return PASS or REJECT with the failing axis:
1. EVIDENCE REAL + n>=3: the cited Calibration or audit rows exist, carry the Direction or reason
   claimed, and number at least 3 of the same family and lever.
2. CHANGE SAFE + SURGICAL: frontmatter intact, procedure coherent, output contract honoured, no hard
   rule weakened (em dash, CTA rule, lock list, the arms-not-fires constraint), no safety gate
   gutted, a targeted edit to the named section and nothing more.
3. LIKELY TO FIX THE WEAKNESS: a plausible mechanism from the edit to the measured weakness.
Write your verdict to your dated verdict file and return the short PASS/REJECT plus rationale.
```

Only PASS proposals proceed. Mark each REJECT `Status: REJECTED ({date}, auditor: {axis})` (not in
`--dry-run`). A rejected proposal is the gate working. `--dry-run` stops after reporting the
verdicts.

---

## Phase 2, GATE (the human gate, mandatory, never bypassed)

You explicitly approve every agent-prompt change, per proposal, before it is applied. No flag, no
auditor PASS, no confidence level bypasses this. Present each PASSED proposal in full:

```markdown
### Agent revision awaiting your approval, {target-agent}
- Target: .Codex/agents/{agent}.md
- Weakness: {...}
- Evidence: n={N}, {rows + their graded Direction}
- Auditor: PASS ({rationale})
- EXACT proposed change:
    Section: {section}
    Before: "{exact current wording}"
    After:  "{exact proposed wording}"
- Expected improvement: {outcome + how it will be checked}

Approve this change? (approve / reject / hold)
```

approve -> Phase 3. reject -> `Status: REJECTED ({date}, operator)`. hold -> `Status: HELD ({date},
operator, {note})`, stays in the queue. Silence is not consent. If no human is present (an
unattended context), apply nothing, leave every PASSED proposal PENDING, report them as
"auditor-passed, awaiting approval", and stop.

---

## Phase 3, APPLY (approved proposals only)

### 3.1 Back up first
```bash
TS="$(date '+%Y-%m-%d-%H%M%S')"; AGENT_FILE=".Codex/agents/{agent}.md"
BACKUP_DIR=".Codex/backups/agent-revisions/$TS"; mkdir -p "$BACKUP_DIR"
cp "$AGENT_FILE" "$BACKUP_DIR/$(basename "$AGENT_FILE")" && ls -la "$BACKUP_DIR/"
```
No confirmed backup, no edit.

### 3.2 Apply the surgical edit
Use Edit to apply the exact before/after to the named section. Nothing else changes: no rewrite, no
reformat, no frontmatter unless that IS the approved change.

### 3.3 Verify the agent is still valid
```bash
head -3 "$AGENT_FILE" | grep -q '^---' && echo "frontmatter: ok" || echo "frontmatter: BROKEN, ROLLBACK"
grep -qE '^name:|^description:' "$AGENT_FILE" && echo "fields: present" || echo "fields: MISSING, ROLLBACK"
grep -c "$(printf '\342\200\224')" "$AGENT_FILE" | grep -q '^0$' && echo "em dash: 0" || echo "em dash: FOUND, ROLLBACK"
grep -qiE '\bT[B]D\b|\bT[O]DO\b|\bF[I]XME\b' "$AGENT_FILE" && echo "completeness: MARKER FOUND, ROLLBACK" || echo "completeness: clean"
```
Any failure: restore the backup immediately, mark the proposal `Status: HELD (apply-failed
validation, {check})`, surface it.

### 3.4 Log with a META-PREDICTION
Append to the log (create with a header if absent):
```markdown
## Applied {YYYY-MM-DD}, {target-agent}
- Agent: .Codex/agents/{agent}.md
- Backup: .Codex/backups/agent-revisions/{TS}/{agent}.md
- Weakness fixed: {...}
- Evidence: n={N}, {...}
- Change: Section {section} | Before: "{...}" | After: "{...}"
- META-PREDICTION: {the specific measurable outcome, e.g. "the agent's {family} predictions stop skewing over-optimistic; calibration accuracy on that family rises from {X}% toward {Y}% within {N} LEARN passes"} | re-check by: {date} | measured by: seo-analyst.
- Status: APPLIED, awaiting meta-prediction re-check {date}.
```
Mark the queue block `Status: APPLIED ({date}, log: agent-revision-log.md)`. A revision with no
falsifiable meta-prediction is not an experiment; every applied revision carries one.

---

## Phase 4, MEASURE (the meta-loop closes)

On or after each re-check date, the seo-analyst (in its normal `/seo-learn` pass) grades the
applied revision against its meta-prediction from real Calibration and engine-health data. HELPED:
`Status: CONFIRMED`, the revision stays. DID NOT HELP: `Status: DID-NOT-HELP, FLAG FOR ROLLBACK`; on
that flag, restore the file from the logged backup, run the 3.3 checks, and mark
`Status: ROLLED-BACK ({date})`. The engine keeps a change only if it measurably worked.

---

## Phase 5, Report

```markdown
## /engine-tune complete, {date}  [flags: {flags}]

### 0 Queue
- Pending drained: {n} (targets: {list}) | already resolved: {m} | malformed HELD: {h}.

### 1 Auditor validation
- {per proposal: {agent}, PASS | REJECT (axis), rationale}. Passed to the gate: {p}.

### 2 Human gate
- {per passed proposal: APPROVED | REJECTED | HELD ({note})}. Approved: {a}.

### 3 Applied
- {per revision: {agent}, section, backup path, validity checks, META-PREDICTION re-check {date}}.

### 4 Measurement contract
- Awaiting re-check: {list + dates}. Resolved this pass: {CONFIRMED | ROLLED-BACK, per entry}.

### Safety
- Human-gated: {a} applied, each explicitly approved; zero auto-applied.
- Auditor-validated, backed up, measured, reversible.

### For the operator
- {proposals awaiting your gate | revisions flagged for rollback | malformed proposals to re-file | nothing pending}.
```

## Boundary

- Tunes `.Codex/agents/*.md` prompts ONLY. Never commands, hooks, strategy docs (those go through
  `PROPOSE_STRATEGY` / `PROPOSE_GEO_STRATEGY`), or the knowledge base (knowledge nominations).
- Ships no SEO change; its allowed tools contain no deploy path by construction.
- Never autonomously rewrites an agent. Proposed, validated, approved, backed up, applied, measured.

## Hard rules

1. Zero em dashes anywhere, including any agent-file edit applied.
2. Human-gated, always, per proposal. Silence is not consent.
3. Auditor-validated first; a missing auditor is a hard stop.
4. Backed up and confirmed before applied.
5. Measured and reversible: a falsifiable META-PREDICTION per applied revision; rollback on
   DID-NOT-HELP.
6. Surgical only.
7. Evidence at n>=3 or it does not proceed.
8. Agent prompts only.

## When NOT to run

- The queue is empty (check `--list`); do not run hoping to find work.
- No human is present to gate; use `--dry-run` to pre-stage the verdicts.
- Immediately after applying a revision, to "check if it worked"; let the re-check date arrive.
- To bulk-rewrite or freehand-improve agents; that has no evidence, no auditor pass, and no
  meta-prediction, and must not go through this loop.

## Maintenance

- Event-driven: run when `/seo-learn` reports a filed proposal. Most weeks there is nothing; a
  stable roster is a healthy roster.
- On a due re-check: review the CONFIRMED or ROLLED-BACK outcome; confirm a rollback restored.
- Quarterly: review the log for which kinds of prompt edits fix which kinds of misses; check the
  CONFIRMED-to-ROLLED-BACK ratio; prune backups older than two quarters once their revisions are
  CONFIRMED.
