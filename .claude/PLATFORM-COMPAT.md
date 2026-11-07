# Platform compatibility notes

What changed in Claude Code recently and what this system does about it. Updated with each new Claudify download. Read this once after installing an update; nothing here needs action unless a line says so.

## November 2026 (covers Claude Code 2.1.290 to 2.1.316, up to 31 Oct 2026)

### Needs one action from you
- **Check your version.** Run `claude --version`. You need 2.1.293 or later to use Haiku 5.5. If you are behind, update Claude Code the way you installed it.
- **On Windows, install Git for Windows.** The hooks in this system are bash scripts. A safety hook that cannot run now blocks the tool call instead of letting it through (2.1.299), so without Git Bash, Claude will stop at every gated step. If these hooks already work for you on Windows, you have it.
- **If you wrote your own scripts that name a model.** Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) retires on 30 November 2026. Change it to `claude-sonnet-5-5`. Fast mode on Opus 4.8 ends the same day (2.1.316), so move anything that uses it to Opus 5.5. Nothing shipped in this system names either one.
- **If you added your own MCP permission rules.** A rule like `mcp__a` now reaches only the server with that exact name (2.1.299). Write `mcp__<server>__*`, using the server's full name.

### Already handled by this system
- **Current models.** The family is `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`. Agents in this system name models by alias (`sonnet`, `opus`, `haiku`), so they move to the current version without an edit. On the Anthropic API, each alias points at the 5.5 model. On Bedrock, Google and Foundry, `sonnet` and `haiku` still point at the 4.5 models.
- **Resuming after compaction.** The resume step runs on `SessionStart` with source `compact`, the event whose output Claude reads. Claude comes back with the latest Session Handoff in front of it and carries on with the Next action.
- **Idle compaction.** A conversation over 200K tokens left idle for about 54 minutes now compacts by itself (2.1.299). The pre-compact handoff hook runs first, and if you come back and ask for something new, Claude does what you asked.
- **Hook output cap.** Each hook's output is now cut at 10,000 characters (2.1.314). The resume step stays under that, so Claude reads all of it.
- **Fresh memory after compaction.** Claude now sees the current `MEMORY.md` and `CLAUDE.md` right after automatic compaction (2.1.311), and the skill list comes back too (2.1.304).
- **Hook input checks.** `updatedInput` from a hook is now validated like Claude's own input (2.1.300). No shipped hook uses it.
- **Model names.** The `[1m]` suffix is gone from model names where it has no effect (2.1.311). No shipped file uses it.
- **Subagent limits.** A subagent now preloads at most 32 skills (2.1.295), and `SubagentStop` hooks run once when a subagent finishes (2.1.311). No shipped agent comes near the limit.

### Worth knowing
- **What compaction does.** Claude Code replaces older messages with a summary. The summary keeps your requests and key code, but small details from early in a long session can drop out. That is why Claude keeps a Session Handoff on disk at each natural task boundary.
- **Choosing when compaction happens.** `/autocompact 500k` sets the window for your session, `autoCompactWindow` sets it in settings, and an agent can set a smaller one in its frontmatter (2.1.296). To turn idle compaction off, use the row in `/config` or set `"idleCompaction": false` (2.1.302).
- **`permissions.blockWritesOutsideWorkingDirectories`** (2.1.314) makes Write, Edit and NotebookEdit refuse paths outside your working folders, in every permission mode.
- **`onFailure: "block"`** (2.1.295) makes a hook that cannot start, or times out, block the action instead of letting it through. Add it to any custom hook you rely on for safety.
- **`/auto-mode-setup`** (2.1.304) is a guided setup that teaches auto mode about your project. The hooks in this system still expect default mode.
- **`sed -i` and `/rewind`** (2.1.309): edits made by `sed -i` are no longer restored by `/rewind`, like other Bash edits.
- **`ultrathink`** now runs its turn at `xhigh` effort on the current models (2.1.311), and `CLAUDE_CODE_DISABLE_ULTRATHINK` turns the keyword off (2.1.316). `CLAUDE_CODE_SUBAGENT_EFFORT` sets the effort for subagents that name none (2.1.316).
- **Permission prompts you may notice.** `pyright` now asks before running (2.1.290). A project's settings file can no longer turn on Claude in Chrome; use `--chrome`, `/chrome` or your user settings (2.1.290).
- **Claude Design.** The standalone site at claude.ai/design closes by 14 December 2026 (2.1.302). This only matters if you use it.

## October 2026 (covers Claude Code 2.1.257 to 2.1.289, 1 Sep to 3 Oct 2026)

### Needs one action from you
- **Permission mode.** Interactive sessions now start in auto mode whenever `permissions.defaultMode` is unset (2.1.284). The hooks in this system are built for default mode, where every PreToolUse gate asks before acting. Add this to your `.claude/settings.json` (settings never ship in updates, so this is a paste):

```json
"permissions": { "defaultMode": "default" }
```

### Already handled by this system
- **Hook matchers are now a hard gate.** A PreToolUse or PermissionRequest hook whose matcher fails or whose input cannot be serialised now blocks the call instead of being skipped (2.1.288). Every shipped hook uses plain matchers (`Bash`, `Write|Edit|NotebookEdit`, `*`) and `validate-hooks.sh` checks each script parses before a session starts.
- **TodoWrite and TaskCreate are not offered on Claude 5 models** (2.1.268), and the `TaskOutput` tool was removed (2.1.277). No shipped hook, agent or command depends on them.
- **Reserved names.** `claude-ai` and `anthropic-skills` are reserved namespaces (2.1.282). No shipped skill, command or MCP server uses them.
- **Compaction timing.** On 1M-context models auto-compact now fires shortly before the limit rather than in a fixed window (2.1.260). The pre-compact handoff hook still runs first; keeping the Session Handoff warm matters more, not less.
- **Subagent output is marked untrusted** (2.1.277). Agents in this system already treat subagent reports as data, never as instructions.

### Worth knowing
- **Claude Mods** (2.1.287): plugins can now ship in-process JavaScript handlers that rewrite prompts, answer tool calls and add commands. A user-installed mod can approve a call that a settings-file PreToolUse hook blocked, because managed hooks run first, then mods, then project hooks. Treat any mod you install like a hook with write access: run `claude plugin validate` and read what it registers before trusting it.
- **`/doctor prompt-audit`** (2.1.283) audits CLAUDE.md, skills, agents and commands for old-model prompting patterns. Run it after each update; report anything it flags in a shipped file.
- **`/skill-doctor`** (2.1.261) shows the context cost of each skill. Use it to prune skills you never invoke.
- **`AGENTS.md`** is read as project instructions only when no CLAUDE.md exists (2.1.277). This system ships CLAUDE.md, so AGENTS.md is ignored unless you remove it.
- **`maxEffortLevel`** (2.1.267) can be set top-level or per model under `modelSettings`; `omitClaudeMd: true` in an agent's frontmatter runs it without project instructions (2.1.271).
- **MCP `alwaysLoad: false`** now defers that server's tools behind tool search (2.1.285); `"type": "sdk"` MCP entries are skipped with a warning (2.1.274).
