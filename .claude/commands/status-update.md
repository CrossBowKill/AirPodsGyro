---
description: Re-paste the most recent substantive output in full when the user lost sight of it
argument-hint: ""
allowed-tools: []
---

Re-paste the most recent substantive output from this session, in full. Use when a compaction, a session resume, a long tool run, or a scrolled-away terminal means the user cannot see the last real answer.

## Procedure

1. Identify the most recent substantive output: a research result, an analysis, a plan, a review, a diff summary, a generated document. Status chatter ("running the tests now") does not count; go back to the last output that carried content.
2. Re-paste it verbatim. Do not summarise, shorten, or tidy it. If it ran to several sections, paste every section.
3. If the output came from subagents or research, paste the synthesis that was shown to the user, not the raw agent returns (unless the raw returns were the output).
4. Preserve all formatting: tables, headers, code blocks, bullet lists.
5. After pasting, restate any next steps or questions that were offered at the time, so the user can pick up exactly where the thread left off.

## When to use

- "I can't see the last message"
- "what did you just say"
- "paste that again"
- The session was compacted or resumed and the user lost the previous answer
- Any time the user asks for the previous output to be repeated

## Rules

- Full output, never a summary. The point is restoring what was lost, not describing it.
- If the previous output no longer exists in context (it was compacted away), say so plainly and offer to regenerate it from the files it was written to, rather than reconstructing it from memory.
- No new content in the paste. Changes and follow-ups come after, clearly separated.
