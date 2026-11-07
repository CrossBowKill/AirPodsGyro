---
user-invocable: false
description: The ranked video and still ad formats for 2026 with why each works, rhythm, pitfalls, the five to avoid, the image-model text verdict, and the Meta 4:5 feed plus 9:16 Stories/Reels placement rule with safe zones
version: 1.0.0
context: fork
---

# Ad Formats 2026

## Purpose

Which short-form video and static formats convert for a skeptical technical audience in 2026, ranked, with the mechanism, the rhythm to produce them at, the pitfalls, and the placement rule. Loaded by `ad-strategist` (format allocation and diversification), `ad-trend-scout` (scoring trends against the ranked list) and `ad-auditor` (the dead list). Directional evidence from 2025-26 creative benchmarks and ad-library teardowns; your own analyst data supersedes it as it accumulates.

**Category**: Branded content / Social media

## Inputs

- The batch size and bucket mix (60/25/15) from the strategist
- The last 14 days of briefs (format fatigue guard)
- The locked ingredients available (anchors, panels, real screenshots): a format you cannot produce honestly is not available

## System Context

Read `video-ads/foundations/PLAYBOOK.md` (the format values), `RECIPE.md` sections 1c-1h (pacing, consistency, moderation) and the brand memory (palette, what the product truly does).

## The ranked video formats (for a dev / founder pain audience)

| # | Format | Why it works | Rhythm | Pitfalls |
|---|---|---|---|---|
| 1 | **Screen-record + narrator** | Proof over people for a ~29%-trust audience; real terminal footage is shareable and gets zoomed into | 8-12 cuts in 25s; hold the terminal 3-4s when it is the proof; cut to it within 2s | Faked terminal output (M-A01); dense UI the viewer cannot read; a demo of three things (one thing only) |
| 2 | **Meme / POV text-on-screen** | A meme ecosystem exists around most dev tools; text-first has the highest hit rate (11.6%) | 5-8 word text frame by 0.5s; one visual idea; logo last | "POV:" wrapper fatigue; the joke that needs sound |
| 3 | **Claymation** | Claimed 2-3x feed CTR as a pattern interrupt; devs share funny | 9-shot problem > villain > hero > product; one anchor; squish/pop sound design; SFX + captions, no VO needed | Mixing stills from different anchors; a payoff beat that maps to no real capability; glossy mascot look |
| 4 | **Founder VO + b-roll** | Confession hook (8.7%) in the skeptic register; the full 8-beat narrative fits | VO at ~2.5 words per second; b-roll cut every 1.5-3s; product name on no-lips beats | Opening "Hi, I'm..."; a held face; the brand name mispronounced by a video model |
| 5 | **Fake podcast clip** | Cold-open mid-take reads native; angle switches hold attention | Angle switch every 2-3s; captions on; one 30s take with both hosts anchored | Production that does not look real; a named real guest |
| 6 | **Split-screen before/after** | Instant comprehension at zero volume; sub-1-second registration | Identical prompt both sides at 0s; labels name each system as it fires; freeze on the delta at 15-22s | Requires REAL reproducible runs; a staged "before" |
| 7 | **Street interview** | Absurd-not-fake-real; 5 speakers deliver in one take with anchors bound | Yellow subs; the question lands at 1.5s; product delayed to the close | Trying to pass it off as real vox-pop; speakers cut off (lenient handoffs, RECIPE 1e) |
| 8 | **Absurdist vignette montage** | 2s clips, one line each; 18M-impression precedent in a prediction-market campaign | 8-12 vignettes, one anchor per creature, hard cuts | A vignette that needs explanation; a "dead / dying" line with a person reference (moderation) |
| 9 | **ASMR clean run** | Keyboard-only audio sells the calm of an automated workflow | One cheap explore slot at most; needs problem framing in text | No arc (M-A07); treating it as a converter |
| 10 | **Whiteboard / kinetic type** | Teaching beats testifying; cheap; HTML-rendered text is always correct | One idea per 4s beat; the listicle skeleton | Too many words per beat; small text |
| Also | **Keynote stage authority** | Account-proven: one presenter on a dark stage, cuts every 1-2s, full-screen HTML product slides, time-hook > mechanism > benefit > offer at ~2.5 words per second | 3 x 8-10s presenter clips + HTML slides; medium framing; cut to the screen by 2s | Two presenters (anchor break); garbled on-screen stats (HTML only); extreme close-ups |
| Also | **News-broadcast desk** | Third-person authority; real reviews as lower-thirds | Anchor with face + voice references; HTML lower-thirds | Fake "breaking news" facts (parody of real news is on the avoid list) |

## The five to avoid

1. AI-avatar UGC passed off as real (40% say heavy AI use lowers trust; 71% aversion to generative-AI ads; 88% prefer human models in 2026 surveys). For a technical audience use overtly stylised or non-human AI, or disclosed presenters.
2. Breaking-news parody with invented facts.
3. Glossy animated-film mascot look.
4. Generic day-in-the-life montage.
5. Courtroom, historical or sports skits with AI humans.

## The ranked still formats (statics drive ~60-70% of conversions in some accounts, at lower CPMs)

1. Terminal one-liner (dark, text-first), 2. Reddit-thread screenshot (+45% CTR / -20% CPA claims), 3. Us-vs-them table (vanilla vs `{your product}`, no competitor named, <= 4 rows), 4. iMessage-style thread, 5. Before/after split (2x install-rate precedent), 6. Big-number stat card, 7. Product-in-hand UGC (the hand resolves the subject in under 0.5s), 8. Tweet-style screenshot (a real quotable customer only). Test once each: editorial cover, notification mock, starter pack. Winners = one specific pain + one specific number; losers = logo + headline, stock lifestyle, multiple CTAs, text over 20% of the canvas. Native-looking formats lift view completion ~35%.

### The image-model text verdict (NB Pro class, 2026)
Short headlines render ~100%; under 15 words ~95%; 15-30 words ~80%; 30+ words ~60%; fails on jargon, small text, tables and dense UI. **Rule:** the image model is for scene, object and texture; HTML owns UI chrome, tables, terminals and anything multi-sentence (RECIPE section 6). Pitfalls that read as fraud to a technical audience: fake handles, fake engagement counts, over-lit studio UGC, over-designed editorial ("wins awards, loses CPA").

## Placement rule: Meta 4:5 feed plus 9:16 Stories/Reels

Every ad ships in two placements from ONE overlay source:
- **9:16 master (1080x1920)** for Stories and Reels. Safe zones: keep text and the CTA out of the top ~14% (about 250px) and the bottom ~20% (about 340px), and the right ~10% (profile, like, share, comment icons). Hook text sits in the upper-middle band.
- **4:5 feed derivative (1080x1350)** for the Feed placement: crop or re-frame the master, re-lay the overlay inside the 4:5 safe area (outer 5% margin, nothing under the caption line). Never ship a 9:16 into Feed with text cut off, and never ship a 1:1 or 16:9 as the primary.
- Build sound-off first in both; captions burned in both; the CTA card in both.
- TikTok: the 9:16 master, 25-35s tolerated, problem-statement hooks.

## Process

1. Allocate the batch: ~half to the paid converters (screen-record + narrator, split-screen, founder VO, keynote authority, Reluctant Convert / Before-After from the UGC family), the rest spread across diversification formats; >= 1 Novel.
2. For each pick, confirm the ingredients exist (anchors, real screenshots, panels) and the format is honest for your product.
3. Note the rhythm in the brief so the scriptwriter writes to it.
4. Deliver both placements; verify safe zones on the rendered frames.

## Output Format

```
Format allocation: {batch}
- {id}: {format} [{bucket}] because {mechanism}; rhythm {...}; ingredients {ok | NEEDS-ANCHOR}
Placements: 9:16 master + 4:5 feed, overlay re-laid
Avoid list checked: yes
```

## Best Practices

- One hook, one visual idea, one CTA, 9:16 cheapest. Dense REAL terminal UI is an asset; never fake it.
- 3D or object renders are the scroll-stopper layer; the real terminal is the proof layer; renders alone are never proof.
- Diversify formats as widely as the batch allows; let delivery reveal the resonant one, then produce twists on the winner.
