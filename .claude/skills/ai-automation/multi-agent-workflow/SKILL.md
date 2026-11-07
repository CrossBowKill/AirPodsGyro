---
description: >
  Orchestration protocol for a parallel research swarm: decompose one hard question
  into phased subagent tasks, run the collectors in parallel, feed their outputs to
  dependent analysts, run a contradiction check, resolve conflicts, and synthesise a
  Research Brief with an evidence-graded confidence. Use when the user says "research
  this properly", "run a swarm on", "evaluate this idea", "should we build X", or asks
  any question that needs several independent sources before it is safe to answer.
  Not for a single lookup (use WebSearch directly), not for code research inside the
  repo (use /onboard or the archaeologist agent), and not for designing a production
  multi-agent system (use ai-agent-design).
user-invocable: true
version: 2.1.0
---

# Multi-Agent Research Workflow

The protocol the main session follows when a question is too wide for one agent and
too important to answer from memory. It turns the question into a swarm: parallel
collectors, dependent analysts, a contradiction check, one synthesis. The output is a
Research Brief whose confidence is set by the evidence, not by optimism.

**Category**: AI & Automation

## When this applies

- A decision rests on facts that live in several places (market, competitors,
  pricing, tooling, regulation, user demand) and getting one of them wrong changes
  the answer.
- The user pitches an idea ("what if we built", "I had an idea", "should we offer").
- A due-diligence, vendor-selection, or build-vs-buy question.

## When it does NOT apply

- One fact, one source: search directly.
- Questions the project's own files answer (`memory.md`, the knowledge base,
  domain memory under `memory/`): read them first, swarm only on the gaps.
- Follow-ups on research already done: edit the existing brief, do not re-run.

## The shape of a swarm

```
Phase 1  3-5 collectors, parallel, one question each      (facts, numbers, sources)
Phase 2  2-3 analysts, parallel, fed Phase 1 output         (economics, risk, defensibility)
Phase 3  1 contradiction detector, fed everything           (conflicts, weak sources, gaps)
Synth    main session resolves conflicts, writes the brief  (one artifact, graded confidence)
```

Two laws hold throughout. **Pull once, feed many:** Phase 2 agents receive Phase 1
output pasted into their prompt; they never re-fetch what a collector already found.
**Typed output only:** every agent returns the structured block its prompt names,
nothing else. Prose returns are re-run, not interpreted.

## Step 0: Pre-flight

1. Read `memory/research-swarm.md` if it exists (create it from `memory/_TEMPLATE.md`
   on the first run). It holds three lists: topics already researched (reuse, do not
   repeat), sources that proved reliable or unreliable, and guardrails extracted from
   previous runs.
2. Read `.claude/knowledge-base.md` for any rule that touches the domain.
3. Every guardrail in the memory file goes verbatim into the prompt of the agent it
   applies to. Guardrails are hard-won; they are not optional context.

## Step 1: Extract the question parameters

| Parameter | Meaning | Example |
|---|---|---|
| **question** | The decision this research informs, as one sentence | "Should we add a self-serve tier under the sales-led plan?" |
| **scope** | Domain, geography, time window | "B2B SaaS, EU and UK, 2024 to now" |
| **what would change the answer** | The one or two facts that flip the decision | "If median self-serve ACV is under 1,200 a year, no" |
| **constraints** | Budget, team, timeline, non-negotiables | "No new headcount this quarter" |
| **known** | What the project already believes, with provenance | "Churn on the current plan is 4 percent monthly [verified]" |

If any parameter is ambiguous, ask before launching anything. One question to the
user costs seconds; a swarm pointed at the wrong question costs the whole run.

## Step 2: Design the swarm

Pick 3 to 5 Phase 1 collectors so that their questions are MECE (no two collectors
answer the same thing, and together they cover what would change the answer). Common
collectors: market size and growth, competitor landscape and pricing, customer demand
and willingness to pay, tooling and build cost, regulation and compliance, trend and
sentiment signals. Then pick the Phase 2 analysts that depend on them: unit economics
(needs market plus pricing), risk register (needs everything), defensibility (needs
competitors plus trends).

Every agent is spawned with the Agent tool, `subagent_type: "general-purpose"`,
`run_in_background: false`, and all agents of one phase are launched in a single
message so they run in parallel. Each prompt follows this template:

```
You are {role}. Answer ONE question and return ONLY the structured output below.

QUESTION: {the collector's single question}
SCOPE: {domain, geography, time window}
CONTEXT FROM EARLIER PHASES: {pasted output, Phase 2 only}

SOURCE RULES
- Prefer primary sources (filings, pricing pages, official docs, datasets) over
  commentary. Record the URL and the date for every number.
- Grade each source A (primary, dated), B (reputable secondary), C (unverified).
- If a number cannot be found, say NOT FOUND. Never estimate silently.
- Use WebSearch and WebFetch, plus any search MCP server configured in .mcp.json.

GUARDRAILS (from previous runs)
{verbatim guardrails for this role, or "none yet"}

RULES
- Do not create or edit files. Return text only.
- Do not research outside your question; another agent owns the rest.
- Return the output block and nothing else.

OUTPUT
## {role} findings
| Finding | Value | Source (URL, date) | Grade |
## Gaps
- {what you looked for and could not find}
## Confidence
{high / medium / low} because {one line}
```

## Step 3: Launch Phase 1

Launch every collector in one message. Wait for all of them. A collector that returns
prose instead of the block is re-run once with "Return ONLY the output block."

## Step 4: Launch Phase 2

Paste the relevant Phase 1 outputs into each analyst's CONTEXT section (the economics
analyst gets market and pricing; the risk analyst gets everything; the defensibility
analyst gets competitors and trends). Launch all analysts in one message. Wait.

## Step 5: Launch the contradiction detector

One agent, fed every Phase 1 and Phase 2 output, with this question: "Cross-reference
these outputs. Report numeric conflicts (two agents, two numbers for the same thing),
directional conflicts (one says growing, one says shrinking), findings that rest only
on grade C sources, and critical data that no agent found." It returns each item
tagged with one of three categories:

| Category | Meaning | What the main session does |
|---|---|---|
| 1 Resolvable | The better-sourced value is obvious | Apply the recommended value silently, note it in the brief |
| 2 Ambiguous | Both values are plausibly sourced | Show both to the user and ask which to use |
| 3 Missing | Nobody found it | List it under "What would raise confidence" |

If the detector flags an entire agent's output as low quality, re-run that agent with
a stricter prompt before synthesising. More than five conflicts: stop and tell the
user the research quality is mixed before writing anything.

## Step 6: Synthesise the Research Brief

The main session writes one artifact. Confidence comes from the table in the next
section, never from how good the idea feels.

```markdown
# Research Brief: {question}

**Answer:** {one paragraph, direct, states the recommendation and the single fact it
rests on most}

**Confidence:** {NN} / 100 ({evidence state from the table below})

## What we found
| Area | Finding | Best source | Grade |
|---|---|---|---|

## What would change the answer
- {the flip conditions from Step 1, each with the value found and whether it clears}

## Contradictions and how they were resolved
- {Category 1 and 2 items, with the value used and why}

## What would raise confidence
- {Category 3 gaps, each with the cheapest experiment or source that would close it}

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

## Recommended next step
{one action, with the signal that would confirm or kill the idea}
```

## Confidence guidelines

| Evidence state | Range |
|---|---|
| Market proven, comparable cases succeed, the team has done this before | 60 to 80 |
| Market exists, no direct comparable, adjacent experience | 40 to 60 |
| Market assumed, no comparable, unproven approach | 20 to 40 |
| Market unclear, significant contradictions in the research | 10 to 20 |
| Research found no supporting evidence | 5 to 15 |

Adjust by up to 10 either way for: existing assets that cut execution risk (up),
several independent grade A sources agreeing (up), a critical risk with no mitigation
(down), a flip condition still unknown (down). Never exceed 80 from research alone;
the last 20 points come from a real experiment.

## Step 7: Write memory and learnings

Append to `memory/research-swarm.md`:
- **Topics researched** (question, date, brief location), so the next run reuses
  instead of repeating.
- **Source quality**: which sites gave grade A data, which gave stale or wrong data.
- **Agent performance**: any role whose output was weak, off-scope, or prose-only.

Register `research-swarm` in `.claude/hooks/topic-routing.yml` pointing at the memory
file so `auto-load-topics.sh` surfaces it next time. Nominate any durable learning
(a source rule, a recurring contradiction) to `.claude/knowledge-nominations.md`.

### Guardrail extraction

For each HIGH-impact contradiction-detector finding, identify the role whose output
caused it and draft a guardrail in this form:

```
- **{Rule name}.** {What to do or not do}. {Why: the finding}. {Run reference}
```

Add it to the memory file's guardrails list. Codify only patterns that recurred across
two or more runs, or had high impact on one run. A guardrail that has not fired in
five runs is removed; stale guardrails are prompt noise.

## Error handling

| Failure | Response |
|---|---|
| Agent returns empty output | Retry once with the same prompt; if still empty, proceed and record the gap |
| Agent times out | Proceed without it; the detector lists its question as missing |
| Agent returns prose, not the block | Re-run with "Return ONLY the output block. No commentary." |
| Agent created or edited files | Discard its output, re-run with the RULES block repeated, log a guardrail |
| Every Phase 1 agent fails | Abort. Tell the user the swarm failed and offer manual research |
| Detector reports more than five conflicts | Pause before synthesis and ask whether to proceed or re-run named agents |

## Worked example

Question: "Should we add a self-serve tier under our sales-led plan?" Flip condition:
median self-serve ACV under 1,200 a year means no.

Phase 1 (one message, four agents): market-size collector (self-serve share of the
category, growth), competitor collector (who offers self-serve, at what price, what
they gate), demand collector (willingness-to-pay signals, trial-to-paid benchmarks),
tooling collector (billing, provisioning, support cost to run self-serve).

Phase 2 (one message, two agents): unit-economics analyst (fed market plus competitor
pricing plus tooling cost: CAC, payback, support load per account), risk analyst (fed
everything: cannibalisation of the sales-led plan, support debt, pricing-page confusion).

Phase 3: the detector finds the competitor collector's median price (1,500) and the
demand collector's benchmark (900) disagree. Category 2: the user is shown both, picks
the competitor figure as closer to the target segment. The brief lands at 45 / 100
("market exists, no direct comparable"), with the recommended next step being a
two-week pricing-page test rather than a build.

## One-line summary

Decompose, collect in parallel, analyse on top, check for contradictions, then write
one brief whose confidence the evidence earned; and write down what the run taught so
the next swarm starts smarter.
