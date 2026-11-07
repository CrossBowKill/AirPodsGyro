---
description: >
  Build, review, and calibrate prompts for the installed agents through a refinement
  loop between two roles (engineer and auditor) that share a prompt registry. Use when
  a prompt matters enough to iterate on, when /enhance output needs deepening, when the
  user says "refine this prompt" or "calibrate the registry", or when a recurring agent
  keeps failing the same way. Not for one-off quick prompts (use /enhance).
user-invocable: false
version: 2.1.0
---

# Prompt Compilation System

Builds, audits, and maintains prompts through a refinement loop between two roles
(engineer and auditor) that share a common knowledge base: `.claude/prompt-registry.yml`.
The system self-improves through calibration cycles that update the registry based on
real-world prompt performance.

**Category**: AI & Automation

## Relationship to /enhance

`/enhance` is the single-pass compiler: it reads the registry once and outputs an
enhanced prompt immediately. This skill is the full loop: draft, challenge, revise,
converge. Use `/enhance` for day-to-day work; use this loop when the prompt will be
reused, drives an important agent, or has failed before.

## Core Files

| File | Purpose | Who reads | Who writes |
|---|---|---|---|
| `.claude/prompt-registry.yml` | Agent prompt requirements, failure modes, effective patterns | Engineer + Auditor | Both (after refinement cycles + calibration) |
| `.claude/knowledge-base.md` | System-wide learned rules | Auditor | Auditor pipeline only |
| `.claude/agents/` | The installed agent roster (source of truth for what exists) | Both | Neither (this loop never edits agent definitions) |

The registry describes only agents that exist in `.claude/agents/`. When an installed
agent has no registry entry, the first refinement session for that agent creates one.

## The Refinement Loop

Not build-then-check. Build-together. Two roles share the registry and converge on the
prompt through structured dialogue before anything gets deployed.

### Roles

**Prompt Engineer**: Drafts the prompt. Reads the registry to understand what the target
agent needs, what has failed before, and what patterns work. Produces structured drafts
with clear sections (role, context, constraints, output format, examples).

**Prompt Auditor**: Reviews the draft against the registry AND the knowledge base.
Challenges gaps, conflicts, or missing elements. Does not just score; it actively
identifies what is wrong and why.

### Protocol

1. User states intent ("I need a prompt for X").
2. Read `.claude/prompt-registry.yml` for the target agent (list `.claude/agents/` to
   confirm the agent exists; create a registry entry if it has none).
3. **Loop** (hard cap: 3 rounds):
   1. Engineer drafts the prompt from the registry entry.
   2. Auditor reviews the draft against: registry must_include / must_avoid, registry
      known_failure_modes, knowledge-base rules, and the quality dimensions below.
   3. Auditor responds PASS (loop exits) or CHALLENGE with specific reasons.
   4. On CHALLENGE, the engineer responds with either FIX (revised draft) or JUSTIFY
      (why the challenge does not apply). The auditor evaluates and the loop continues.
4. If no consensus by round 3: flag to the user with both positions stated. The user
   decides; the decision is logged to the registry as a learned pattern.
5. On PASS: deliver the final prompt, and update the registry with any new learnings
   from the session (new failure modes observed, new effective patterns confirmed).

### Challenge Categories

The auditor's challenges are specific and actionable:

| Category | Example Challenge |
|---|---|
| **Missing requirement** | "The registry says this agent needs explicit geography. The prompt omits it." |
| **Known failure mode** | "This prompt doesn't guard against the agent's documented tendency to default to US-only results." |
| **Constraint gap** | "Output format not specified. The agent has a defined schema; include it or the output will be unstructured." |
| **Knowledge-base conflict** | "A knowledge-base Hard Rule contradicts this instruction. Fix the prompt, not the rule." |
| **Example missing** | "No examples of good/bad output. For this agent, 2-3 concrete examples dramatically improve recall." |
| **Edge case** | "What happens if the agent finds zero results? The prompt doesn't handle it." |

### Engineer Responses

**FIX**: Agrees with the challenge, revises the draft.

```
ROUND 2: FIX
Challenge accepted: [which challenge]
Change: [what was added/modified]
[Revised draft follows]
```

**JUSTIFY**: Disagrees with the challenge, explains why.

```
ROUND 2: JUSTIFY
Challenge: [which challenge]
Justification: [why it doesn't apply in this context]
```

The auditor evaluates justifications. If sound, the challenge is withdrawn. If not,
the auditor re-challenges with additional reasoning.

## Quality Dimensions

Every draft is judged on these seven dimensions. A prompt that is weak on any of them
gets a CHALLENGE, not a pass with a caveat:

1. **Clarity**: Is the task unambiguous? Could two readers interpret it differently?
2. **Completeness**: Are all must_include items present? All inputs the agent needs?
3. **Constraint coverage**: Are must_avoid items and known failure modes guarded explicitly?
4. **Output specification**: Is the exact output structure defined?
5. **Context economy**: Is every included fact load-bearing? No padding?
6. **Intent fidelity**: Does the prompt still do what the user originally asked?
7. **Testability**: Could you tell from the output alone whether the prompt worked?

## Registry Maintenance

- **After each refinement session**: add newly observed failure modes and confirmed
  effective patterns to the target agent's entry. Increment nothing else.
- **Calibration cycle** (every 2 weeks, or when an agent's outputs feel off): review each
  entry against how the agent actually performed. Stale requirements get pruned; the
  `last_calibrated` date gets updated; entries for agents no longer installed get removed.
- **Registry writes are additive within a session**: never delete another session's
  learnings during a refinement loop; pruning belongs to the calibration cycle only.

## System Context

Before starting:
- Read `memory.md` for current project context and priorities
- Check `knowledge-base.md` for relevant learned rules or constraints
- List `.claude/agents/` so the loop targets agents that actually exist
