---
user-invocable: false
description: Produce a short-form video ad with the voice-first recipe, the retention arc, the 8-beat narrative, locked anchors, HTML-only on-screen text, and your configured generation tooling
version: 1.0.0
context: fork
---

# Video Ad Production

## Purpose

The Video Ad Engine recipe (`video-ads/foundations/RECIPE.md`) distilled into a how-to: how one 15-25s vertical paid ad is actually built, from locked ingredients to a verified `final.mp4` in both placements, using your configured image and video generation CLI or MCP and your configured TTS. Loaded by `ad-director` (spec) and `ad-producer` (execution), and usable by hand for a one-off.

**Category**: Scriptwriting / Branded content

## Inputs

### Required
- **A brief at Spec Ready** (`video-ads/briefs/{id}.md`) or, for a one-off, a script with beats marked HERO / B-ROLL and seconds per beat
- **Locked ingredients**: one anchor still per character and per set in `video-ads/anchors/`, one locked voice reference in `video-ads/voice/brand-voice.json`, the HTML panels for every word on screen in `video-ads/overlays/{id}/`
- **Tooling**: ffmpeg + ffprobe, a headless browser renderer (Playwright or equivalent), your generation CLI or MCP, your TTS with word timing

### Optional
- Real screen-recording clips, real screenshots or benchmarks (the proof layer)
- A reusable segment library (`video-ads/segments/MANIFEST.md`)

## System Context

Before starting read `RECIPE.md` (all sections), `BUDGETS.md` (cap, ceilings, cascade), `MISTAKES-LOG.md` (what the auditor will fail), and the brand memory for palette and voice.

## Process

### Step 1: Ingredients first (never spend on an unproven ingredient)
- Generate 3 candidate presenter or character stills with your image model (4K, style-anchored), pick ONE, save as the anchor. 2-3 set stills, pick one. 2-3 voice candidates on the hook line, pick one, freeze its settings in `brand-voice.json`.
- Render every on-screen text element as an HTML panel (terminal card, stat board, folder tree, lower-third, split-terminal, end card) with the headless browser to PNG. Embed images as base64 (a `file://` image is blocked by `setContent`); avoid double quotes inside inline style strings. Approve the panels as stills. Cost: 0 credits.
- Write the allowed-word list for the ad: every word and digit permitted on screen.

### Step 2: Script to the arc and the budget
Hook (0-3s) -> problem (3-10s) -> discovery (10-15s) -> result (15-20s) -> CTA (20-25s), carrying the 8-beat narrative (pain hook, why it happens, belief shift blaming the missing system, the mechanism, the product, avatar-matched benefits, value stack with `{your price}`, honest future pace). Per beat: `words <= seconds x 2.5`. Product-name lines on no-lips beats. No real person named in speech. Cut to b-roll by 2s; hero beats one sentence, medium framing, moving camera.

### Step 3: Choose the assembly mode
- **Single take** when the format is verified to hold a 30s take with references bound (claymation, two-host podcast, street interview, documentary VO, flat cartoon, absurdist vignettes): one multi-reference job, every anchor and panel bound, a real product still as `--start-image`. No stitching.
- **Continuous**: one master VO, silent clips laid on it. Best seams for a monologue.
- **Modular**: per-beat VO snippets with the same voice reference, reusable segments. Cheapest across many ads.

### Step 4: Voice (the spine)
Render the full VO ONCE with word timing (`vo.mp3` + `vo.timing.json`), locked voice, frozen settings. Never re-roll the voice; never change settings between renders. Slice beats at timing word boundaries with `ffmpeg -ss -to`.

### Step 5: Generate beats (anchors bound, prompts verbatim)
Prompt order per beat: subject + action, setting, camera move, lighting and mood, the style-anchor clause repeated verbatim, the invariants clause ("the EXACT same character: same shape, size, colour, casing, face, set, camera angle"), references bound, 9:16, duration, "no text, no captions, no watermarks", and for spoken beats the pace clause ("about two and a half words per second, natural pauses; natural pace takes priority over timing; never speed up, never drop words, never cut mid-sentence; each speaker finishes, then a short pause").

Model by job (reference costs in BUDGETS.md):
- Presenter dialogue 9:16: a dialogue model that binds face + voice references in one job (MiniMax H3 class, 20 credits per 10s at 2K). Render the line with your TTS, pass it as the audio reference. A/B once against the polished-dialogue alternative (Veo 3.1 class, ~3x cost, 8s ceiling, weaker close-ups) before a batch.
- Audio-driven talking avatar, long: lipsync-studio class (needs a one-time CLI capability test; fall back to b-roll + VO until confirmed).
- Stylised and ambient b-roll: Kling 3.0 class image-to-video from the anchored still (8.75-10 credits per 5s; 4K mode 30). Turbo tier for filler.
- Desktop or code ambience: image model still (dark IDE, terminal, GENERIC code), then image-to-video.
- Full-screen UI, numbers, any text: NEVER generated. HTML panel, composited.

Reference invocation shapes (substitute your tool's syntax; the Higgsfield CLI and MCP are one documented option):
```bash
# quote before spend (dry run), then generate with references bound and a long wait
<gen-cli> image create --model <image-model> --prompt "<still prompt>" --reference anchors/presenter-a.png --resolution 4k --aspect 9:16 --json
<gen-cli> video create --model <video-model> --prompt "<beat prompt>" --start-image rendered/{id}/still-02.png --reference anchors/presenter-a.png --audio rendered/{id}/vo-beat-01.mp3 --aspect 9:16 --duration 10 --wait --wait-timeout 1200 --json
<gen-cli> video upscale --input rendered/{id}/clip-02.mp4 --output rendered/{id}/clip-02-1080p.mp4 --preset ugc
<gen-cli> account transactions --json   # read the REAL charge, log it
```
Moderation: a spoken real-person name, "dead / dying / heartbeat" wording with a sleeping-person reference, and similar combinations return a reject (auto-refund). Use an epithet in speech, keep the name in the burned card, budget one retry.

### Step 6: Normalise, stitch, burn, verify
- Upscale every clip to >= 1080p, then `ffmpeg -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -r 30` (odd dimensions like 1076x1928 at 24fps break the concat graph).
- Concat in edit-list order; mux the ONE master VO (continuous) or audio-safe concat (modular).
- Render the caption overlay from the timing JSON (word-by-word, lowercase, one bold keyword per line, inside the safe zones: top ~14%, bottom ~20%, right ~10% clear) and the CTA card; `ffmpeg -i stitched.mp4 -i overlay.png -filter_complex "[0:v][1:v]overlay=0:0" -c:a copy final.mp4`.
- Second placement: crop or re-frame to 1080x1350 with the overlay re-laid for 4:5; `final-4x5.mp4`.
- Verify with ffprobe: 1080x1920, 30fps, 15-25s; 1080x1350 for the feed cut. Extract frames at 1fps and read every word against the allowed-word list.
- Log the REAL charge per job to `.Codex/logs/video-ads-spend.log`.

### Step 7: Hand off to the auditor
The ad is not finished until `ad-auditor` returns PASS in fresh context and the brief sits at `In Review`. Nothing is approved or uploaded by any agent.

## Output Format

```
Video Ad Production: {brand} / {id}

Assembly mode: {single_take | continuous | modular}
Beats: {N} ({H hero / B b-roll}); anchors bound: {list}; panels: {list}
Voice: {voice ref}, one render, timing JSON at {path}
Final: video-ads/rendered/{id}/final.mp4 ({dur}s, 1080x1920, 30fps) + final-4x5.mp4
Spend: {credits} cr (real charges logged), MTD {mtd}/{cap}
Fallbacks or retries: {none | ...}

Next: ad-auditor (fresh context) -> In Review -> your approval
```

## Best Practices

- **Voice-first, always.** One voice render drives the ad; talking shots are rendered TO it. Never generate a talking clip then swap its audio.
- **Anchors or nothing.** No clip without an approved start still bound. Contact-sheet check (silhouette, colour, face, set) before anything is shown or sent to a video model.
- **Text is HTML.** Every word on screen is a pre-rendered panel on the allowed-word list. Models garble text; a technical audience reads it.
- **Cheap tier + upscale beats the flaky ultra tier.** Verified 720p to 1080p at no charge; the 70-90 credit ultra tier hangs.
- **Single take beats stitching** where a verified single-take format exists. Seams are where drift enters.
- **One variable per re-roll.** Re-roll an off-model clip before compositing; never patch around it.
- **Disclose AI** where the platform requires it; never pass an AI human off as real to a technical audience.

## After Completion

- Append the real spend rows and any fallback notes to the brief's `## Production Log` and the producer MEMORY.
- Store any reusable voiced segment (CTA, recurring hook) in `video-ads/segments/` with a manifest row.
- If a new render failure pattern appeared twice, nominate it via `.Codex/knowledge-nominations.md` (PROPOSE_MISTAKE).
