---
description: Transform a raw prompt into an agent-tailored, project-aware enhanced prompt
argument-hint: "<raw prompt text>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(ls:*)
---

Single-pass prompt compiler. Takes a raw prompt and transforms it against the prompt registry, the knowledge base, and the installed agent roster to produce a project-aware, agent-tailored version.

This is NOT a full iterative refinement loop (that is the prompt-compilation skill). This is a lightweight, instant enhancement for day-to-day use.

## Source Files

- **Prompt Registry**: `.claude/prompt-registry.yml`
- **Knowledge Base**: `.claude/knowledge-base.md`
- **Agent Definitions**: `.claude/agents/`
- **Agent Memory**: `.claude/agent-memory/`

Read only what a step calls for. Do not preload everything.

## Steps

### Step 0: Capture the raw prompt

The user's `$ARGUMENTS` is the raw prompt to enhance.

If `$ARGUMENTS` is empty or too vague (under 10 words with no clear intent), ask:
> "What do you want the prompt to do? Give me the raw version and I'll compile it."

Otherwise, proceed.

### Step 1: Identify the target

1. **Target agent**: Which agent will execute this prompt? List the installed roster at runtime (`ls .claude/agents/`) and match the raw prompt's intent against the agent filenames and, where a candidate matches, the `description` line in its frontmatter. Do not assume any fixed roster; the installed set is the source of truth.
   - If exactly one agent fits: that is the target.
   - If several fit: pick the closest match and note the alternatives in the output header.
   - If none fit: treat it as a **general session prompt** (still enhance with knowledge-base rules).

2. **Domain**: What domain knowledge does the task need? If a skill under `.claude/skills/` clearly covers the domain (match by category and slug), note it for Step 2. If nothing clearly matches, skip; do not scan the whole skills tree.

### Step 2: Load context

Based on Step 1, read the following (only what is relevant):

**Always load:**
- The registry entry for the target agent in `.claude/prompt-registry.yml`, if one exists
- `.claude/knowledge-base.md` (scan for Hard Rules that apply to this task)

**Conditionally load:**
- The target agent's definition file (for its tools and output contract) if the registry has no entry for it
- `agent-memory/{agent}/MEMORY.md`, if it exists, for known patterns and recent learnings
- The matched skill's `SKILL.md`, if Step 1 identified one

### Step 3: Compile the enhanced prompt

Transform the raw prompt by layering in context. Follow this structure:

```
## Role
[From the registry purpose field, or the agent definition's description: what this agent IS]

## Context
[Project-specific context loaded in Step 2:]
- Relevant knowledge-base rules that apply to this task
- Agent memory patterns (recent learnings, known pitfalls)

## Task
[The user's original intent, preserved but clarified]
[Add any must_include items from the registry that the raw prompt missed]

## Constraints
[From the registry: must_avoid items]
[From the knowledge base: relevant Hard Rules]
[From agent memory: known failure modes to guard against]

## Output Format
[From the registry: output_format field, or the agent definition's output contract]

## Effective Patterns
[From the registry: effective_patterns, only the ones relevant to this specific task]
```

Omit any section that has no real content for this task. An empty header is noise.

### Step 4: Quality check

Before outputting, verify the enhanced prompt against these gates:

1. **Does it include ALL must_include items from the registry?** If not, add them.
2. **Does it guard against ALL known_failure_modes?** Add explicit guards for the top 3.
3. **Does it contradict any knowledge-base Hard Rules?** Fix if so.
4. **Is the output format specified?** If not, add it from the registry or agent definition.
5. **Is it still recognisably the user's intent?** Enhancement should amplify, not replace.

### Step 5: Output

Present the enhanced prompt in a clean, copy-pasteable block:

```
---
Enhanced from: [first 50 chars of raw prompt]...
Target: [agent name or "general"]
Registry version: [from prompt-registry.yml]
---

[THE ENHANCED PROMPT]
```

Then ask:
> "Enhanced. Want to use it now, tweak anything, or run the full refinement loop instead?"

## Rules

- **Preserve intent**: The enhanced prompt must do what the user asked. Enhancement means adding guardrails and context, not changing the goal.
- **Don't over-engineer**: If the raw prompt is already good and specific, light-touch it. Don't layer on 500 words of context for a simple task.
- **Registry is the source of truth**: If the registry says must_include X, include X. If it says must_avoid Y, guard against Y.
- **Knowledge-base rules are mandatory**: If a Hard Rule applies, it is non-negotiable in the enhanced prompt.
- **Agent memory is advisory**: Known patterns and learnings inform the prompt but don't override explicit user intent.
- **Registry gaps are fine**: An agent with no registry entry still gets enhanced from its definition file plus the knowledge base. Suggest adding a registry entry when the same agent comes up repeatedly.
- **One pass only**: This is not the refinement loop. Compile once, output once, move on. If the user wants iterative refinement, point them to the prompt-compilation skill.
