# Quick page: one good landing page

The shortcut for "I just want one good landing page", or a fresh blank folder. No brand system, no framework and no build step are needed. The result is an `index.html` and a stylesheet that open by double-clicking, judged by the same juror as a full run. Read only the files this page names.

Throughout, `<taste>` means `<engine>/library/design-taste-frontend`, given as an absolute path.

## 1. Get the facts

If a profile exists, use it. If not, run `setup.md` in its shortest form: the page's subject, who it is for and the one thing a visitor should do. Take anything the request already says. Then write the profile and go.

Make the run folder `design-runs/<YYYY-MM-DD>-<slug>/` and start `LOG.md`. Say in one line what the tools check found.

## 2. Think before you draw

Write these in the log:
- The one-line brief: page, audience, one action.
- An inventory: 8 to 12 things only this subject has (its name, place, materials, rituals, printed things, real numbers).
- The argument: one line per section, a claim and its proof. Delete any section with no claim.
- The idea: "On this page, [something that belongs to the subject] becomes [a device]." If a competitor's name fits the sentence, it is a category idea. Try again.
- One live thing a visitor can do, built from the subject's real content.

Read `<taste>/references/copy.md` for the argument and the headline arithmetic.

## 3. Choose a direction

From the site's folder:

```bash
node "<taste>/scripts/draw.mjs" --list sectors
node "<taste>/scripts/draw.mjs" --sector <sector> --brief "<one line>" --sections <roles in the order of your argument> --options 3
node "<taste>/scripts/draw.mjs" --sector <sector> --brief "<one line>" --sections <the same roles> --direction <chosen id>
```

Pass `--keep palette,type` only when the profile fixes them. Choose the direction that can carry an inventory item, and note why. The last command prints a direction sheet: adopt it.

Without Node, read `<taste>/references/layout.md`, `type.md` and `colour.md`, then write three directions by hand, each with a different composition, and choose one.

## 4. Build it

Build it still first, with motion off in your head.

- One `index.html`, one `styles.css`, and a little script only for the live thing. No framework, no package install.
- Colour and type as CSS custom properties, from the sheet or the profile.
- The whole copy, written in full. Sample details such as names are fine and go in the handover list. Numbers come only from a source the user named. Proof is never invented: no customers, quotes, reviews, logos or statistics.
- Pictures, in this order: the user's own; open-licence pictures of the subject's world with credits (`node "<taste>/scripts/assets.mjs" "<query>"`, then `--get` and `--credits`); drawn in the page's real colours; type and colour alone. Download what you use into the site's folder.
- A phone layout that is its own composition, real headings, visible focus states, alt text.

Then add restrained motion with `<engine>/library/animate/GUIDE.md`: transform and opacity only, with a `prefers-reduced-motion` fallback that keeps all the content.

## 5. Check it

From the site's own folder, when the tools check allows:

```bash
node "<taste>/scripts/lint.mjs" .
node "<taste>/scripts/inspect.mjs" index.html
node "<engine>/scripts/shots.mjs" index.html --out "<run folder>/shots"
```

Fix every FAIL. Treat each WARN as wrong unless you can defend it in one sentence. Read the screenshots yourself and fix what looks wrong. If a check could not run, log that plainly. If the page has no real pictures yet, say so in the handover; never fake them.

## 6. Juror

Spawn `design-juror` with `run_in_background: false`, passing the run folder, the profile name, the screenshots folder and round 1. Fix what it lists and run round 2 if needed. After two FAILs, stop and show the user both options.

## 7. Hand it over

Show the phone and desktop screenshots, the juror verdict, how to open the page, and what the user should replace before it goes live. Do not deploy it.
