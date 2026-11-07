# Profile: [brand name]

This file overrides every guide in the design engine. Keep it short and true. Leave a line as "not set" when you do not know it yet. A blank never means "invent one". Setup instructions: `references/setup.md`.

## What it is
[One or two sentences: what it does and for whom.]

## Audience and the one action
- Audience: [who visits, and what they already know]
- Default action: [the one thing a visitor should do]

## Tokens
- Theme: [light, dark, both, or not set]
- Ground: [hex or not set]
- Ink: [hex or not set]
- Accent: [hex or not set]
- Display type: [family or not set]
- Text type: [family or not set]
- Radius: [px or not set]
- Spacing and other tokens: [link to a CSS file, or not set]

When colours or type are set here, pass `--keep palette,type` to the direction draw. When they are not set, take what the draw deals.

## Voice
- How it talks: [plain, warm, dry, technical]
- Words it never uses: [list or not set]

## Sources of truth
Every number on a page must come from a source named here or by the user, never invented.
- Prices: [file, page or person]
- Customer counts, ratings, results: [file, page or person]
- Quotes and logos: [where the approved ones live]

## Hard rules
Any breach is an automatic FAIL from the juror.
- [Something the page must never say, show or promise]

## Real assets
- Logo: [path or not set]
- Product screenshots or photographs: [path or not set]

## The site
- Folder: [where the site's files live]
- Stack: [plain HTML, React, Next.js, Astro]
- Local address: [such as http://localhost:3000, or not set]
- Deploy host: [so run files can be kept out of the deploy]
