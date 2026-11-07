---
description: Claude ecosystem intelligence scan that finds new features, patterns, and improvement opportunities for your installed system
argument-hint: "[optional: specific focus area like 'hooks', 'MCP', 'agent SDK']"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - Agent
---

Intelligence scan of the Claude ecosystem. Dispatches 3 parallel research agents to scan official Anthropic sources, the wider web, and technical communities for Claude-related updates, then synthesizes findings into concrete improvement suggestions for YOUR installed configuration.

**Spawn synchronously:** every Agent spawn in this procedure must pass `run_in_background: false`. Step 2 consumes all three agents' outputs before it can run.

## Source Files

- **Daily Note**: `Daily Notes/MMDDYY.md`
- **Knowledge Base**: `.claude/knowledge-base.md`
- **Knowledge Nominations**: `.claude/knowledge-nominations.md`
- **CLAUDE.md**: project root
- **Settings**: `.claude/settings.json`
- **Command Index**: `.claude/command-index.md`
- **Intel Memory**: `.claude/agent-memory/intel/MEMORY.md`

## Steps

### Step 0: Load context

1. Get today's date (MMDDYY format).
2. Check today's daily note for an "Intel Scan" section. If the scan already ran today and no focus area was given, say so and stop.
3. If `$ARGUMENTS` is provided, use it as a focus filter (e.g. "hooks" narrows all 3 agents to hook-related content).
4. Read `.claude/knowledge-base.md` to understand what the system already knows (avoid rediscovering known facts).
5. Build a one-paragraph **installed-system snapshot** to inject into the agent prompts: list the installed agents (`ls .claude/agents/`), the command count (`ls .claude/commands/`), the skill categories (`ls .claude/skills/`), and the MCP servers in `.mcp.json` if present. This is what makes findings relevant to THIS installation rather than generic.
6. Read `.claude/agent-memory/intel/MEMORY.md` (if it exists) and load search-strategy refinements from previous scans:
   - Inject **high-value queries** into agent prompts (replace or supplement default queries)
   - Add **high-value sources** as priority targets in agent instructions
   - Add **blacklisted sources** to agent skip lists
   - Add **coverage gap queries** as new search terms
   - If no memory file exists (first run), use the default queries in Step 1 as-is

### Step 1: Dispatch parallel research agents

Launch **3 agents simultaneously** using the Agent tool. All use `subagent_type: "general-purpose"`, a fast/cheap model, and `run_in_background: false`.

If `$ARGUMENTS` specifies a focus area, narrow all 3 agents to that domain. Otherwise use the full search scope below.

---

**Agent A: Official Sources Scanner**

```
Prompt:
You are an intelligence scanner for a Claude Code operating system.
Your job: find recent official Claude Code and Anthropic updates.

SEARCH STRATEGY (run ALL of these):
1. WebFetch: https://docs.anthropic.com/en/docs/claude-code: scan for new sections or recent changes
2. WebFetch: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md: new releases since {LAST SCAN DATE or "the last 14 days"}
3. WebSearch: "Claude Code" release OR changelog {CURRENT YEAR}
4. WebSearch: anthropic.com announcement {CURRENT YEAR}
5. WebSearch: "claude agent SDK" update OR release

[If focus area specified: prioritise "{focus area}" content]

For each finding (aim for 5-10):
- **Source**: URL
- **Date**: When published/updated
- **Key takeaway**: 1-2 sentence summary
- **Category**: one of [feature, deprecation, best-practice, documentation, security]

PRIORITY RULES:
- Breaking changes and deprecations = always flag as RISK
- New hook events, tool types, or settings keys = high priority
- Skip anything older than 30 days unless it is a breaking change

Return ALL findings in your response. Do NOT create any files.
Today's date: {TODAY}.
```

---

**Agent B: Community & MCP Ecosystem Scanner**

```
Prompt:
You are a web intelligence scanner for a Claude Code operating system.
Your job: find validated community techniques, tools, and new MCP servers.

SEARCH STRATEGY (run ALL of these):
1. WebSearch: "claude code tips" OR "claude code workflow": practical techniques
2. WebSearch: "CLAUDE.md" configuration: people sharing setups
3. WebSearch: "claude code hooks" pattern: hook techniques
4. WebSearch: "MCP server" new release {CURRENT YEAR}: new MCP servers
5. WebSearch: "awesome claude code" OR "claude code tools": community tool lists
6. WebSearch: "claude code" multi-agent OR orchestration: coordination patterns

[If focus area specified: narrow searches to "{focus area}" + claude]

For each finding (aim for 8-12):
- **Source**: URL
- **Key takeaway**: 1-2 sentence summary of what is useful
- **Category**: one of [pattern, tool, MCP, risk]

PRIORITY RULES:
- Practical "here's how I did X" posts beat theoretical discussions
- Code snippets and configs beat opinions
- Patterns validated by multiple sources beat single blog posts
- New MCP servers with practical utility beat experimental toys
- Ignore: AI hype posts, vague opinions, engagement bait

Return ALL findings in your response. Do NOT create any files.
Today's date: {TODAY}. Search for content from the last 14 days.
```

---

**Agent C: Pattern/Technique Scanner**

```
Prompt:
You are a technical pattern scanner for a Claude Code operating system.
Your job: find advanced techniques and architectural patterns that could improve the installed system.

INSTALLED SYSTEM CONTEXT (so you know what is relevant):
{INSTALLED-SYSTEM SNAPSHOT from Step 0: agents, commands, skill categories, hooks, memory architecture, MCP servers}

SEARCH STRATEGY:
1. WebSearch: "Claude Code" architecture pattern {CURRENT YEAR}
2. WebSearch: "claude code hooks" advanced pattern
3. WebSearch: "context window" management claude
4. WebSearch: "prompt engineering" techniques {CURRENT YEAR} advanced
5. WebSearch: "claude code" memory OR persistence
6. WebSearch: "MCP" pattern OR workflow {CURRENT YEAR}

[If focus area specified: narrow searches to "{focus area}" techniques]

For each finding:
- **Source**: URL
- **Pattern name**: Short descriptive name
- **Description**: What it does (2-3 sentences)
- **Category**: one of [architecture, hooks, memory, prompt-engineering, agent-coordination, MCP, context-management]
- **Adoption difficulty**: quick-win / half-day / multi-session
- **Which installed files it would affect**: infer from the system context above where possible

PRIORITY RULES:
- Patterns with working code examples beat theoretical descriptions
- Patterns that solve problems the installed system plausibly has beat novel but unrelated ones
- Simple patterns that improve existing workflows beat complex new architectures

Return ALL findings in your response. Do NOT create any files.
Today's date: {TODAY}.
```

### Step 2: Synthesize findings

Once all 3 agents return, read their outputs and:

1. **Deduplicate**: same finding from multiple agents means merge it and note it was independently found (higher signal).
2. **Relevance filter**: for each finding, ask "Would this change something in the installed system?" If no, drop it.
3. **Categorise** into 4 buckets:

| Category | What it means | Action |
|---|---|---|
| **New Features** | Anthropic shipped something worth adopting | Evaluate for implementation |
| **Community Patterns** | Techniques others validated | Add to improvement suggestions |
| **Tool/MCP Updates** | New servers, tools, or integrations | Evaluate for installation |
| **Risk Signals** | Deprecations, breaking changes, security issues | Flag as urgent if the installed system is affected |

4. **Rank by impact**: High/Medium/Low based on: does it fix a known problem? does it add a missing capability? does it reduce friction?

### Step 3: Generate improvement suggestions

For each HIGH and MEDIUM impact finding, produce:

```
### [Finding title]
**What**: [1-2 sentence description]
**Impact**: HIGH / MEDIUM
**Category**: [from Step 2]
**Source**: [URL]
**Action**: [Specific implementation path: which files, which changes]
**Effort**: Quick win / Half-day / Multi-session
**Affects**: [List of installed files, e.g. `.claude/settings.json`, `CLAUDE.md`, a specific hook]
```

### Step 4: Write outputs

1. **Append the intel report to today's daily note** under a new section:

```markdown
## Intel Scan

**Scan date**: {TODAY}
**Focus**: {$ARGUMENTS or "Full ecosystem scan"}
**Agents**: 3 parallel (Official Sources, Community/MCP, Pattern/Technique)

### Key Findings ({count})
[Top 5 findings, one line each with category tag]

### Improvement Suggestions ({count})
[Each suggestion from Step 3]

### Risk Signals
[Any deprecations, breaking changes, or security issues, or "None detected"]
```

2. **Add verified learnings to `.claude/knowledge-nominations.md`**, only findings that are:
   - From official Anthropic sources (features, API changes, deprecations)
   - Validated by multiple independent sources
   - Directly relevant to a specific installed file or process

Format each nomination:
```markdown
- **[Intel {TODAY}]**: {finding}. Source: {URL}. Affects: {installed file/process}. [Source: intel scan, {provenance level}]
```

3. **Surface to the user** with a verbal summary:
   > "Intel scan complete. {X} findings across {Y} sources.
   > Top 3: [one-liner each]
   > Improvement suggestions: [count] ({quick wins} quick wins, {half-day} half-day, {multi} multi-session)
   > Risk signals: [count or 'none']
   > Want me to implement any of the quick wins now?"

### Step 5: Self-improvement retrospective

After every scan, evaluate the scan itself and update `.claude/agent-memory/intel/MEMORY.md`.

**Evaluate each agent's performance:**

For each of the 3 agents (A, B, C), assess:

1. **Signal-to-noise ratio**: How many findings survived the relevance filter? Score: high (over 70% kept), medium (40-70%), low (under 40%).
2. **Search query effectiveness**: Which specific queries produced the best findings? Which returned nothing useful? Note the exact query strings.
3. **Source quality**: Which sources (domains, accounts, repos) consistently produced high-value results? Which were noise?
4. **Coverage gaps**: Was there anything in the synthesis that NONE of the 3 agents found but should have? What query would have caught it?
5. **Duplicate waste**: How much overlap between agents? Some overlap is good (corroboration); excessive overlap means the search scopes need differentiating.

**Write to intel memory** (update the existing sections in `.claude/agent-memory/intel/MEMORY.md`):

- High-value queries (keep and carry forward)
- Low-value queries (modify or drop, with suggested replacements)
- High-value sources (prioritise next scan)
- Blacklisted sources (skip: SEO spam, outdated, paywalled)
- Coverage gaps found (add targeted queries for next scan)
- One new row in the Scan History table

On the NEXT `/intel` run, Step 0 reads this memory and injects the refinements into the agent prompts. This creates a closed loop: scan, evaluate, refine queries, better next scan.

## Rules

- **Don't rediscover known facts**: Read knowledge-base.md first. If a finding is already documented there, skip it.
- **Official sources beat community posts**: Anthropic docs and announcements always outrank blog posts and social threads.
- **Specificity over volume**: 5 actionable findings beat 20 vague ones. Filter aggressively.
- **No direct KB writes**: All learnings go through knowledge-nominations and the auditor pipeline. Intel does not bypass the quality gate.
- **Improvement suggestions must be specific**: "Update hooks" is not a suggestion. "Add a PostToolUse hook to `.claude/settings.json` that validates JSON schema after editing settings files" is a suggestion.
- **Focus mode narrows, doesn't exclude**: When `$ARGUMENTS` provides a focus, agents still scan broadly but prioritise that area. Don't miss a critical Anthropic announcement because the focus was "hooks".
- **Cheap agents only**: This is scan work, not analysis. Keep it fast. If a finding needs deep analysis, flag it as "needs deeper investigation" for a manual follow-up.
- **Cadence is a habit, not a ritual**: Unlike /start and /wrap-up, /intel is a recommended periodic habit, not a requirement. Skip silently on light days.
