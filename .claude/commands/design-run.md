---
description: Take a page, component or ad set from brief to an independent juror verdict, or make one good landing page in a blank folder. No brand system needed.
argument-hint: "[setup | quick | profile name] [what to design]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - Bash(node:*, python3:*, python:*, py:*, npx --no-install playwright:*, ls:*, mkdir:*, date:*)
---

**Spawn synchronously:** every Agent/Task spawn in this procedure must pass `run_in_background: false`. This command acts on the juror's verdict in its next step, so a background spawn would race it.

Runs the design engine. It works on an existing site or an empty folder, with or without a brand system. Named `/design-run` so it never clashes with Claude Code's own `/design`.

Examples:
- `/design-run` asks what you want, then starts.
- `/design-run quick a landing page for my pottery studio` makes one good page in this folder.
- `/design-run setup` writes your brand profile.
- `/design-run acme the pricing page` runs on an existing page with the `acme` profile.

## When to run

Any new or reworked page, section, component or static ad set. For a one-line copy tweak, skip it.

## Steps

### Step 1: Load the engine

Find `design-engine/SKILL.md`: in `.claude/skills/` in this project, otherwise in `~/.claude/skills/`. Read it and follow its "Before anything" list.

### Step 2: Read the arguments

- `setup`: follow `references/setup.md`, show the profile, and stop.
- `quick`, or a request for one landing page, or an empty folder: use the Quick page run in `references/quick-page.md`.
- A first word that matches a file in `profiles/`: use that profile. The rest is the job.
- No arguments: ask "What do you want to design, and is it for an existing site or a new one?", then go on.
- No profile yet: run the setup questions first, in their shortest form.

### Step 3: Start the run

Create `design-runs/<YYYY-MM-DD>-<slug>/` in the project and start `LOG.md`. Pick the run length from the skill's table and say which in one line. Keep the run folder out of the user's deploy, as the skill describes.

### Step 4: Work through the phases

In order, recording each gate result in the log. A check that could not run is logged as not run.

### Step 5: Spawn the juror

Spawn `design-juror` with `run_in_background: false`, passing the profile name, the run folder, the screenshots folder, the local URL if one is running, and the round number. Fix and resubmit once. After a second FAIL, stop and show the user both options: the version as built, and what the juror's open fixes would change.

### Step 6: Report to the user

Phone and desktop screenshots, the juror verdict, what to replace before going live, and any decision only they can make.

## Never

- Run paid image or video generation without the user's yes for that run with the cost stated.
- Put a number on a page that has no source the user named.
- Override a juror FAIL, or finish with a failed gate.
- Replace a profile's tokens with a palette or font from a guide.
- Deploy or publish from this command.

## Output contract

```
RUN: <quick | full | polish | component | ad set | review> on <page>
PROFILE: <name>
TOOLS: <what the tools check found>
GATES: <each gate: pass, fail or not run>
JUROR: PASS | FAIL, round <n>, <score line>
SHOTS: <path to phone and desktop screenshots>
BEFORE YOU GO LIVE: <sample content, numbers to confirm, decisions>
```
