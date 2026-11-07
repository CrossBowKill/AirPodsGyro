# Where the guides come from

The guides are adapted from public skills by their upstream authors. Each folder under `library/` carries its licence. `NOTICES.md` lists the changes made to each one.

| Guides | Author | Source repo | Commit | Licence |
|---|---|---|---|---|
| emil-design-eng, animate, animation-vocabulary, animation-performance, improve-animations, review-animations, find-animation-opportunities, apple-design, break-ui, pick-ui-library, prototype | Emil Kowalski | emilkowalski/skills | 2d228630ba14 | MIT |
| frontend-design, canvas-design, webapp-testing | Anthropic | anthropics/skills | dbd4588f9e10 | Apache 2.0 |
| vercel-react-view-transitions, vercel-composition-patterns, vercel-react-best-practices | Vercel | vercel-labs/agent-skills | 063bee94c3f4 | MIT |
| web-design-guidelines | Vercel | vercel-labs/agent-skills (the skill) and vercel-labs/web-interface-guidelines (the rules) | 063bee94c3f4 and 4ecfb9fb8d1d | MIT |
| design-taste-frontend | Leonxlnx | Leonxlnx/taste-skill | 12af471f627f | MIT |
| scroll-craft | Nate Herk | nateherkai/scroll-craft | 75d81f74e836 | MIT |
| ui-ux-pro-max, design-system, banner-design | Next Level Builder | nextlevelbuilder/ui-ux-pro-max-skill | d14efff8ed1f | MIT |
| ui-styling | Next Level Builder | nextlevelbuilder/ui-ux-pro-max-skill | d14efff8ed1f | MIT (repo), with an Apache 2.0 notice in the folder |

Bundled third-party files: Chart.js 4.4.1 (MIT, licence beside it in `library/design-system/assets/vendor/`) and eight font families in `library/canvas-design/canvas-fonts/` (SIL Open Font License, each with its licence text).

Do not replace a guide with a newer upstream copy. The local changes in `NOTICES.md` keep instructions local, keep scripts on this machine and keep paid generation behind the user's yes, and an upstream copy would lose them.

## Left out, and why

- `Jakubantalik/Libraries.dev`: aimed at selling a paid tier and installed seven unpinned packages.
- `vercel-labs/agent-skills` writing-guidelines: fetches its rules from the web on every run. Its deploy and CLI skills are out of scope.
- `anthropics/skills` brand-guidelines, theme-factory, web-artifacts-builder, algorithmic-art and the document skills: not page design work.
- `emilkowalski/skills` mobile and native skills, and `expo/skills`, `twostraws/swiftui-agent-skill`: the engine is for the web.
- `ui-ux-pro-max`'s `design`, `brand` and `slides` skills: they overlap with the guides here.
