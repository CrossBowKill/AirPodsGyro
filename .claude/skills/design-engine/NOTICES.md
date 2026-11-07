# Notices

The design engine's orchestration files (`SKILL.md`, `references/`, `profiles/`, `scripts/shots.mjs`), `/design-run` and the `design-juror` agent are part of Claudify. The guides under `library/` are adapted from third-party open-source skills, listed here with their source, licence and the local changes. Each folder carries its licence file.

The entry file of every guide was renamed from `SKILL.md` to `GUIDE.md`, and references to it updated, and every folder moved under `library/`, so that a guide runs only inside the engine. Every guide also gained one line saying the user's profile overrides it, keeps `disable-model-invocation: true` in its frontmatter, and had em and en dashes replaced with plain punctuation. These apply to every guide and are not repeated below.

## emilkowalski/skills, commit 2d228630ba14, MIT, Copyright (c) 2026 Emil Kowalski

| Guide | Other local changes |
|---|---|
| emil-design-eng, animate, animation-vocabulary, animation-performance, apple-design | Canned initial response removed |
| improve-animations | Canned initial response and the non-interactive default removed |
| review-animations, find-animation-opportunities, break-ui, pick-ui-library, prototype | None |

## anthropics/skills, commit dbd4588f9e10, Apache License 2.0, Copyright 2026 Anthropic, PBC

| Guide | Other local changes |
|---|---|
| frontend-design | Added: the profile's tokens are the brief |
| canvas-design | Removed a fabricated user quote and the instruction to download fonts. Trimmed to eight font families, with a list of what ships; each font keeps its SIL Open Font License text |
| webapp-testing | Added a localhost and file-only scope rule. Removed the instruction to run scripts without reading them. Example scripts print a plain message when Playwright is missing |

## vercel-labs/agent-skills, commit 063bee94c3f4, MIT

| Guide | Other local changes |
|---|---|
| web-design-guidelines | Reads a pinned local copy of the rules instead of fetching them from the web on every run. Rules from vercel-labs/web-interface-guidelines, commit 4ecfb9fb8d1d, MIT, Copyright (c) 2025 Vercel Labs |
| vercel-react-best-practices | Added: server and async rules are never applied to payment, webhook or email routes. README, metadata and the compiled `AGENTS.md` removed; the rules stay as individual files |
| vercel-composition-patterns, vercel-react-view-transitions | Folder renamed to match the skill name. README, metadata and the compiled `AGENTS.md` removed |

## Leonxlnx/taste-skill, commit 12af471f627f, MIT, Copyright (c) 2026 Leonxlnx

| Guide | Other local changes |
|---|---|
| design-taste-frontend | Folder renamed from taste-skill. `inspect.mjs` and `scenes.mjs` serve only the page's own folder, refuse dotfiles, foreign hosts and unknown file types, and open only localhost addresses and local files (`scripts/lib/local-only.mjs`, added). Scripts run from the site's folder. Paid image generation needs the user's yes for that run. README and evals removed. Two photograph entries removed from the library. |

## nateherkai/scroll-craft, commit 75d81f74e836, MIT, Copyright (c) 2026 Nate Herk

| Guide | Other local changes |
|---|---|
| scroll-craft | Paid generation and upload script removed, with its passages. `allowed-tools` removed. Local server binds to this machine, refuses dotfiles, foreign hosts and unknown file types, and its network mode is removed. `.env` scan removed. Deploy advice now asks the user. Verification harnesses open localhost only. One worked example anonymised. Changelog removed |

## nextlevelbuilder/ui-ux-pro-max-skill, commit d14efff8ed1f, MIT, Copyright (c) 2024 Next Level Builder

| Guide | Other local changes |
|---|---|
| ui-ux-pro-max | Script paths made portable. Added: the profile overrides saved design files. Removed the validator, its reference catalogues (icons, font licences, provenance) and the desktop-app stacks (JavaFX, WPF, WinUI, Avalonia, Uno, UWP). Noto fonts and date columns dropped from the font table. Tests removed |
| design-system | Chart.js vendored locally (4.4.1, MIT, licence beside it) in place of a CDN script. Output paths follow the working folder. Demo deck rebranded to an invented name. Dangling references and tests removed |
| banner-design | Secrecy block and an obsolete text rule removed. Paid generation needs the user's yes for that run |
| ui-styling | Keeps the Apache License 2.0 notice shipped in its folder. `shadcn_add.py` accepts only a plain x.y.z version and refuses component names with ":" or "/". Remote docs line, poster trigger, coverage data, tests and duplicate fonts removed |

## Bundled files

| File | Licence |
|---|---|
| `library/design-system/assets/vendor/chart.umd.min.js` | Chart.js 4.4.1, MIT, `chart-LICENSE.md` beside it |
| `library/canvas-design/canvas-fonts/*.ttf` | SIL Open Font License 1.1, each with its `-OFL.txt` |
| `library/design-taste-frontend/library/photos.json` | Picture references only, no image files. Sourced from Lorem Picsum under the Unsplash licence |
