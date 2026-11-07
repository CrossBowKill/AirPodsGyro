---
name: "source-command-system-map"
description: "Open a live map of your whole Claudify system in your browser, with health, next steps and your agents, commands and skills."
---

# source-command-system-map

Use this skill when the user asks to run the migrated source command `system-map`.

## Command Template

# /system-map

Opens System Map: a small local web page that shows your system as a place. Each part of Claudify is a building, and animated workers show file activity as it happens. It runs on this computer only and sends nothing anywhere.

`/system-map stop` shuts it down. `/system-map status` says whether it is running.

## Steps

### Step 1: Check for Node

Run:

```bash
node --version
```

If that fails, or the version is below 18, tell the user this and stop. Everything else in Claudify keeps working without Node.

> System Map needs Node 18 or later, and this computer does not have it yet. Nothing else in Claudify needs it.
>
> To add it, download the LTS installer from nodejs.org and run it. On Windows you can also run `winget install OpenJS.NodeJS.LTS`, and on a Mac with Homebrew you can run `brew install node`.
>
> Then open a new terminal, start Codex again and run `/system-map`.

### Step 2: Run it

Run this from the project folder. Do not change directory first: the map reads whichever project it is started in.

Always try the copy in your home folder first, because it did not come with the project you have open:

- With `stop`: `node ~/.Codex/system-map/server.mjs stop`
- With `status`: `node ~/.Codex/system-map/server.mjs status`
- With no argument: `node ~/.Codex/system-map/server.mjs start`

If Node says it cannot find that file, run the same command with this project's copy, `node .Codex/system-map/server.mjs`, followed by the same word. On Windows PowerShell, write `$HOME` where these say `~`. If neither copy exists, tell the user the map files are missing from this install and stop. Never run any other file, and never use `node -e`.

`start` returns straight away and leaves the map running in the background. It tries to open your browser, and if the usual port is taken it picks the next free one.

### Step 3: Tell the user

Pass on the full link the command printed, exactly as printed, including everything after the `#`. Then add one line: "This link is private to this run, so keep it out of anything you share or film. The map stops by itself about 30 minutes after you close the page, or run `/system-map stop`."

If the browser did not open, tell them to paste the link into their browser. If they refresh the page or lose it, running `/system-map` again gives them the link.

If the command says it could not start, pass on what it said.

## Output contract

The link the map is running at, or that it stopped, in plain English. Nothing else.

## Rules

- Never start the server any other way, and never run it in the foreground. It would block this session.
- The map only reads files. It never changes your project, and its generated data stays in `.Codex/system-map/data/`.
- It shows only your commands, agents, skills, hooks and memory files, and it names everything else without opening it. It refuses any file that shows a known key shape, and a password written in plain words can still show.
- Everything it shows comes from your files. It does not test tool connections or run your automations.
