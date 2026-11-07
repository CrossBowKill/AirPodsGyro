---
description: "Plan and write a daily short-video series. Builds a 30 day map, writes scripts with three hooks each, and keeps a ledger so hooks never repeat."
argument-hint: "[setup|map|write|log|review|status] {brand} [track] [day] [day-end]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebSearch
---

# /daily-script [action] {brand} [track] [day] [day-end]

Runs a daily short-video series from files instead of from a blank page each morning. You set up a series once, build a 30 day map, then write scripts a week at a time. Every hook you ever write goes into a ledger, so the system never hands you the same opening twice.

## When to use

- You want to post short videos regularly for a brand and need a month planned: `/daily-script setup {brand}`, then `/daily-script map {brand} {track}`
- You want this week's scripts: `/daily-script write {brand} {track} 8 14`
- You published some videos and have their numbers: `/daily-script log {brand}`
- A week has ended and you want to see which hooks held: `/daily-script review {brand}`
- You forgot where you got to: `/daily-script status {brand}`

## Arguments

```
/daily-script setup acme
/daily-script map acme tips
/daily-script write acme tips 8
/daily-script write acme tips 8 14
/daily-script write acme all 8
/daily-script log acme
/daily-script log acme tips 8
/daily-script review acme
/daily-script status acme
```

`{brand}` is the brand memory slug. If it is missing, use the Active Brand in `.claude/memory.md`, and if there is none, ask. `{track}` is a track name from the series file, or `all` for every track. `{day}` is the episode number, 1 to 30, and `{day-end}` writes a range.

With no action, run `status`.

## Files

| Path | What it is | Who changes it |
|---|---|---|
| `daily-scripts/FRAMEWORK.md` | The beats, hook families, QA gate and script format | Claudify |
| `daily-scripts/_templates/` | Blank copies of the files below | Claudify |
| `daily-scripts/{brand}/series.md` | Audience, tracks, length, cadence, proof bank, call-to-action rules | You, through `setup` |
| `daily-scripts/{brand}/map-{track}.md` | The 30 day episode map for one track | You, through `map` |
| `daily-scripts/{brand}/hook-ledger.md` | Every hook ever written for this brand, across all tracks | This command and you |
| `daily-scripts/{brand}/scripts/` | One file per script | This command and you |

## The first check, on every action

Before anything else, look for `.claude/agent-memory/content-creator/brand-memories/{brand}.md`.

If it is missing, stop and say exactly this, with the slug filled in:

> There is no brand memory for {brand} yet, and every script is written from it. Run `/brand-memory create {brand}` first. It takes about ten minutes. Add your website address to the end of that command and it will read the site for you. Then come back to `/daily-script setup {brand}`.

Write nothing. If the file exists, read it in full. Its readers, voice anchors, banned phrases and signature phrases are binding on everything below. Never improvise a voice.

Then, for any action except `setup`, look for `daily-scripts/{brand}/series.md`. If it is missing, say so and run `setup`.

## Procedure: setup

### Step 1: Check for an existing series

If `daily-scripts/{brand}/series.md` exists, show it and ask what changed. Edit only what the user names. Never recreate the folder over existing work.

### Step 2: Ask only what the brand memory does not already answer

Ask in one message, grouped:

1. Who is this series for? Offer the brand memory's readers and ask which one this series speaks to.
2. Which platforms will it post on? Default to the brand memory's platforms.
3. How many tracks? A track is a separate audience or a separate job, with its own map. One is the right answer for most brands. For each track: a short name (lowercase, a hyphen is fine), who it is for, and what it should get people to do.
4. How often does each track post? Daily, or a set number of days a week. What is the start date?
5. Is this to camera, screen recording, or both? How long should a video be? Offer 30 to 60 seconds as the default.
6. What can you really show on screen? List real things: a product, a process, a dashboard, a before and after, a customer story you have permission to use. This is the proof bank. Nothing outside it can be claimed as proof.
7. Which numbers and claims are you allowed to use? Anything else stays out.
8. What is the single next step you want people to take, and how often may a video mention it?
9. What must never appear? Legal limits, claims you will not make, topics to avoid.

If the user says "keep it simple", accept one track, the default length, and an empty numbers list, and list those assumptions at the end.

### Step 3: Write the files

Create `daily-scripts/{brand}/` and `daily-scripts/{brand}/scripts/`. Copy `daily-scripts/_templates/series.md` to `daily-scripts/{brand}/series.md` and fill in every field from the answers. Copy `daily-scripts/_templates/hook-ledger.md` to `daily-scripts/{brand}/hook-ledger.md`.

### Step 4: Confirm

Show the series in five lines and finish with the next step:

> Series saved. Next: `/daily-script map {brand} {track}` builds your 30 day plan.

## Procedure: map

### Step 1: Load

Read `daily-scripts/FRAMEWORK.md`, `daily-scripts/{brand}/series.md`, the hook ledger, and the brand memory. If `.claude/agent-memory/content-creator/trend-pool.md` has a section for this brand from the last 7 days, use it as a source of topics. If it does not, carry on without it and mention `/trend-scan {brand}` once in the output.

If `daily-scripts/{brand}/map-{track}.md` already exists, show it and ask whether to extend it or start a new month. To start a new month, rename the old file to `map-{track}-{YYYY-MM}.md` first. Never overwrite a map.

### Step 2: Choose the topics

List what this track's audience gets wrong, gets stuck on, or keeps asking. Take these from the brand memory's readers, the trend pool, and what the user tells you. If those are thin, use WebSearch for the questions this audience is asking now, and label anything you found that way as researched, not as fact. Give each episode exactly one idea.

### Step 3: Lay out 30 episodes

Copy `daily-scripts/_templates/episode-map.md` to `daily-scripts/{brand}/map-{track}.md`. Fill all 30 rows.

| Week | Days | Job of the week |
|---|---|---|
| 1 | 1 to 7 | The idea. Correct the belief this track exists to correct. No sales line at all. |
| 2 | 8 to 14 | Show it working, with something real on screen. |
| 3 | 15 to 21 | The specifics your audience asks about, one per episode. |
| 4 | 22 to 30 | The bigger picture, what you got wrong, where to start, and the invitation. |

Rules for the map:

- One idea per row, written as a sentence a viewer could repeat.
- Every row names a hook family from the framework. No two episodes in a row share a family, and no family appears more than twice in any seven days.
- A retired family in the hook ledger is not used for this track.
- The proof column names an item from the series proof bank, or says `camera only`. Never invent proof. If an episode needs proof the bank does not have, mark it `needs proof` and list it at the end of the map for the user.
- The payoff column holds a send line or a comment keyword, never "follow for more". Follow the series rule for how often the next step appears. On a day it does, the send line comes first and the next step last.
- Use the `Specific number` family only on a row with a real number from the series file. If the series has none to spare, leave the family out and say so.
- Mark five evergreen rows with `[bank]` after the title. These cover a sick day or a missed day.

### Step 4: Check and confirm

Count the rows and confirm there are 30. Count the families and confirm the spacing rule holds. Show the first week in full, then the other three weeks as titles only, and list any `needs proof` rows.

> Map saved to `daily-scripts/{brand}/map-{track}.md`. Edit any row you like. Next: `/daily-script write {brand} {track} 1 7` writes your first week.

## Procedure: write

For each requested day, in order, for each requested track:

### Step 1: Load

Read `daily-scripts/FRAMEWORK.md`, `daily-scripts/{brand}/series.md`, the requested row of the map, and `daily-scripts/{brand}/hook-ledger.md`. Read `.claude/knowledge-base.md` for the universal content rules. Read `.claude/skills/content/scriptwriting/talking-head-script/SKILL.md` for its platform policy gate if the file is there. If no map exists for the track, stop and point to `/daily-script map {brand} {track}`.

If the script's file already exists and contains a `## Verdict` section, the user has already judged it. Write the new one as `{track}-{dd}-v2.md`, with `v2` in the Note of its ledger rows. Those rows stay `offered` until the user picks one. Never overwrite a judged script.

### Step 2: Check the hook family

If the row's family is retired in the ledger for this track, choose the next best family and say so in the output.

### Step 3: Write three hooks

Write three different hooks in the row's family. All three must pass the QA gate. Then test each against every row of the hook ledger, for all tracks and all statuses, using the duplicate test in the framework. A hook that fails is thrown away and replaced. Say how many you replaced.

### Step 4: Write the script

Follow the framework's beats and format:

- Beats, not a word-for-word script. One suggested sentence per beat, in the voice of the brand memory's calibration pairs.
- Three teach beats at most.
- Mark a screen beat `[SCREEN: item]` using an item from the proof bank. If the row says `camera only`, there is no screen beat.
- The payoff comes from the map row. Use the next step only if the series rule allows it on this day.
- On-screen text: frame one is the hook, then one short line per beat.
- Caption: under 150 characters before the fold, then one more line. Use the spelling the brand memory uses.

### Step 5: Run the QA gate

Go through every line of the QA gate in the framework and tick each one honestly. If a line fails, fix the script and run the gate again. A failing script is never saved as finished. Count the spoken words and state the length at the series' speaking pace.

### Step 6: Save and record

Write `daily-scripts/{brand}/scripts/{track}-{dd}.md`, with `{dd}` as two digits. Append one row per hook to the ledger with status `offered`, in the same step. The first hook is the default choice; set its status to `chosen`, except on a `-v2` script.

If the user later picks a different hook, set that one to `chosen` and the old one back to `offered`.

### Step 7: Report

One line per script: day, title, default hook, spoken word count, seconds at pace, QA pass. Then the next unwritten day.

The user's next reply about a script is a verdict. Run the `/feedback` procedure and append a `## Verdict` section to the script file with the date and what was said.

## Procedure: log

1. Read the ledger and list the `chosen` rows with no result.
2. Ask the user to paste what they have, from the platform's own insights, for each one: published date, hold at three seconds, completion rate, sends and reach. Any field can be blank.
3. Set each row's status to `published` and fill in the numbers exactly as given. A number with no column, such as views or follows, goes in the Note. Never treat one metric as another: views are not reach. Work out sends per reach only when both numbers are there. Never estimate a missing number.

## Procedure: review

Run this weekly once videos are out.

1. Read the ledger. Count the published rows per track.
2. With fewer than ten published rows on a track, list what has been published, say the sample is too small to judge, and stop for that track. Change nothing.
3. With ten or more, work out that track's own median hold at three seconds. Compare every hook family against it. Use only this brand's own rows, never a benchmark from the internet.
4. A family whose last three published videos on a track all held below that track's median is retired for that track: add it to the Retired Families table in the ledger with the date and the three rows. Tell the user. They can overrule it by deleting the row.
5. List the payoffs with the highest sends per reach, and any keyword that drew fewer than five comments twice. Suggest changes to unwritten map rows, but change nothing without a yes.
6. If any track reached ten, add a dated summary under Weekly Summaries in the ledger.

## Procedure: status

Show, for each track: the map's month, how many of the 30 rows have scripts, the next unwritten day, how many hooks the ledger holds, how many are published, and any retired families. Then give the single next command to run. If there are no maps yet, give the `map` command.

## Rules

- Writes files only. It never posts, schedules, emails, or generates paid images or video.
- One folder per brand. Never copy hooks, proof or results between brands.
- Every hook written is in the ledger, whether or not it was used. No hook may repeat.
- Proof comes from the series proof bank. Never invent a number, a customer or a result.
- Never promise followers, growth, revenue or any result inside a time window.
- Never overwrite a map, or a script that has a verdict.
- Never delete a ledger row. Ledger history is how the system learns.
- No em dashes in any file it writes.

## Output

- `daily-scripts/{brand}/series.md` (setup)
- `daily-scripts/{brand}/map-{track}.md` (map)
- `daily-scripts/{brand}/scripts/{track}-{dd}.md` (write)
- `daily-scripts/{brand}/hook-ledger.md` (write, log, review)
- A short report naming the next command to run
