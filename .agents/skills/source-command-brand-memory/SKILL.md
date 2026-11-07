---
name: "source-command-brand-memory"
description: "Migrated source command `brand-memory`"
---

# source-command-brand-memory

Use this skill when the user asks to run the migrated source command `brand-memory`.

## Command Template

# /brand-memory [create|show|update] {brand} [url]

Create, inspect or refresh the memory file for a brand. Every content command (`/content`, `/post`, `/thread`, `/blog`, `/trend-scan`, `/ad-build`) reads this file first, so it is the first thing to set up for a new brand.

## When to use

- A new brand, product, client or newsletter needs content: `/brand-memory create {brand}`
- You want to see what the system knows about a brand: `/brand-memory show {brand}`
- Positioning, audience, offers or voice changed: `/brand-memory update {brand}`

## Arguments

```
/brand-memory create acme
/brand-memory create acme https://acme.com
/brand-memory show acme
/brand-memory update acme
```

`{brand}` is the slug used for the file name: lowercase, letters, numbers and hyphens only. `acme`, `acme-blog`, `weekly-dispatch`. If the user types a name with spaces or capitals, propose the slug and confirm it.

If no action is given, treat it as `show` when the file exists and `create` when it does not.

## Procedure: create

### Step 1: Check for an existing file

Look for `.Codex/agent-memory/content-creator/brand-memories/{brand}.md`.

If it exists: say so, show its Brand Identity section, and ask whether the user wants `update` instead. Never overwrite an existing brand memory.

### Step 2: Gather what already exists

Read, if present:
- `Codex.local.md` (the My Brands & Properties, audience and voice sections; the user may have filled these in at install)
- `.Codex/memory.md` (Active Brand, Brands table)
- Any file the user names (a style guide, past posts, a positioning doc)

If the user gave a URL, fetch it with the web fetch tool and read the home page plus the about, pricing and product pages it links to. Take only what the site states: what it sells, to whom, in what words. Note the words the brand uses for itself and its customers.

### Step 3: Ask only for what is still missing

Ask in one message, grouped, skipping anything Step 2 already answered:

1. What the brand sells and to whom, in one sentence.
2. Why it exists: the problem it solves and what makes it credible.
3. The three readers: floor (least familiar), middle, ceiling (most expert). Who they are, what they know, what they do not.
4. Voice: three to five adjectives, first person or company voice, formality, humour, and two or three writers or brands whose voice is close.
5. Three paragraphs the user has written and likes (any channel). These become the on-brand side of the calibration pairs.
6. Words and claims never to use (legal limits, tired industry words, competitor names, anything the brand has decided against).
7. Platforms in use and the default one, posting rhythm, and any fixed rules (newsletter day, always a code block, never emoji).
8. Visual tokens if ads or graphics are wanted: colours, fonts, logo placement, or the path to a design-system file.

Wait for the answers. If the user says "just use the site" or gives short answers, fill the gaps with explicit, labelled assumptions and list them at the end so they can be corrected.

### Step 4: Write the file

Copy `.Codex/agent-memory/content-creator/brand-memories/_TEMPLATE.md` to `{brand}.md` and fill every section:

- Brand Identity: name, slug, primary URL, owner, today's date, the one-line value prop, why the brand exists.
- ICP: floor, middle and ceiling readers from the answers.
- Voice Anchors: at least three calibration pairs. For each, write the off-brand version yourself (hedged, generic, marketing voice) and use the user's own paragraph, or a rewrite in their stated voice, as the on-brand version. State what is different in one sentence.
- Banned Phrases: the user's list, each with its reason.
- Signature Phrases: up to three, taken from the user's own writing. Leave the list short.
- Approved Patterns, Candidates, Watch List, User Phrases, Content History: leave the "none yet" rows. They fill in as pieces ship and verdicts arrive through `/feedback`.
- Brand-Specific Operating Notes: platforms, default platform, rhythm, fixed rules, visual tokens or the design-system path.

Keep every placeholder out of the finished file: no curly braces, no example markers, no open items.

### Step 5: Register the brand

- `.Codex/memory.md`: add a row to the Brands table (brand, memory file path, voice spec version 1, no drift report yet, 0 pieces). If Active Brand is "none yet", set it to this brand. If the file has no Brands table or Active Brand line, add them under its first heading.
- `Codex.local.md`: if the My Brands & Properties list still holds the example entries, replace them with this brand and its slug.

### Step 6: Confirm

Show the Brand Identity and the three calibration pairs back to the user, list any assumptions made, and finish with the next step:

> Brand memory saved for {brand}. Try: `/post linkedin "a topic you care about"` or `/content {brand}`.

## Procedure: show

Read the file and present: Brand Identity, the readers in one line each, the calibration pairs, banned and signature phrases, operating notes, and the Content History count. If the file is missing, say so and offer `create`.

## Procedure: update

1. Read the file and show the user the sections that can change: identity, readers, voice anchors, banned phrases, signature phrases, operating notes.
2. Ask what changed. Edit only those sections. Add new calibration pairs rather than deleting old ones unless the user says a pair is wrong.
3. Never touch Approved Patterns, Candidates, Watch List, User Phrases or Content History by hand: those are owned by `/feedback` and the `brand-voice-keeper` agent.
4. Bump the voice spec version in `.Codex/memory.md` when a voice anchor or banned phrase changed, and note the date.
5. If the voice changed materially, recommend `/trend-scan {brand}` and a `brand-voice-keeper` drift check on the next piece.

## Rules

- One file per brand. Never mix two brands in one file or copy patterns across brands.
- Never invent audience facts, numbers or quotes. Unknown stays unknown, labelled as an assumption.
- Universal rules in `.Codex/knowledge-base.md` (no em dashes, no marketing voice, the AI-detector tells) still apply on top of anything in the brand file.
- The file is the single source of voice truth. Agents read it; they do not improvise around it.

## Output

- `.Codex/agent-memory/content-creator/brand-memories/{brand}.md` (create or update)
- `.Codex/memory.md` Brands table and Active Brand (create)
- A short confirmation with assumptions listed
