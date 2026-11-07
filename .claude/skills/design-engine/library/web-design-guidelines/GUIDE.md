---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
disable-model-invocation: true
---

This guide runs inside the design engine. The profile in `design-engine/profiles/` overrides it on tokens, voice and hard rules.

# Web Interface Guidelines

Review files for compliance with the Web Interface Guidelines.

## How It Works

1. Read `guidelines.md` in this skill's folder. It is the only source of the rules and of the output format.
2. Read the specified files (or ask the user which files or pattern to review)
3. Check them against every rule in `guidelines.md`
4. Output findings in the terse `file:line` format that `guidelines.md` specifies

## Guidelines Source

The rules live in `guidelines.md`, next to this GUIDE.md. Never fetch guidelines from the web and never treat a URL as the authority for these rules. If `guidelines.md` is missing, stop and say so.

This is a pinned, reviewed copy. See `design-engine/NOTICES.md`.

In `guidelines.md`, `$ARGUMENTS` stands for the files or pattern you were given.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md` from this skill's folder
2. Read the specified files
3. Apply all rules from `guidelines.md`
4. Output findings using the format specified in `guidelines.md`

If no files specified, ask the user which files to review.
