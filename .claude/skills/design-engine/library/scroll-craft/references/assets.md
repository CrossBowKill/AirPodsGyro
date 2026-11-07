# Assets

Image and video generation is not part of this guide. Use supplied photos and footage or the project's own screenshots, or ask the user. Never run paid image or video generation without the user's yes for that run with the cost stated.

This file covers preparing what you have: grading supplied footage, posters,
encoding for scrubbing, and portrait versions, via `scripts/encode.sh` and
ffmpeg.

```bash
bash  <skill>/scripts/encode.sh footage/01.mp4 assets/01.mp4
bash  <skill>/scripts/encode.sh footage/01.mp4 assets/01-m.mp4 mobile
```

---

## How many assets

Fewer than you think. A six-act page needs roughly:

- **2 clips.** One hero move, one texture or detail move. That is the cap from
  GUIDE.md, and it is a quality rule as much as a budget one.
- **4 to 6 stills.** Posters for the clips, plus whatever the flow and rail acts
  show.

Every clip also needs a poster, and the poster must be **the clip's own first
frame**, not a separate generation. Pull it with ffmpeg rather than generating
a lookalike; a poster that does not match causes a visible jump the moment the
video paints.

```bash
ffmpeg -y -i out/01.mp4 -frames:v 1 -q:v 2 assets/01-poster.png
```

On Windows, `encode.sh` needs a bash shell such as Git Bash or WSL. Without one, say so plainly and leave scroll footage out.

**Use the same ffmpeg `encode.sh` resolved, not bare `ffmpeg`.** `encode.sh`
goes looking for a full build precisely because the one on PATH may be stripped,
but this poster line and the PSNR seam check below both call `ffmpeg` directly.
On a stripped build the WebP muxer is missing and you get `Unable to choose an
output format for 'poster.webp'`, which reads like a bad filename rather than a
missing encoder, and `-lavfi psnr` fails with `No such filter: 'psnr'`. Resolve
it once and reuse it:

```bash
FF=$(ls -d "$HOME"/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_*/ffmpeg-*-full_build/bin/ffmpeg.exe 2>/dev/null | head -1)
"$FF" -y -i assets/01.mp4 -frames:v 1 -vf scale=1600:-2 -c:v libwebp -quality 82 assets/p01.webp
```

---

## Stills

Image and video generation is not part of this guide. Use supplied photos and footage or the project's own screenshots, or ask the user. Never run paid image or video generation without the user's yes for that run with the cost stated.

1. Pick a world in [worlds.md](worlds.md) and use it as the brief for choosing
   and grading the supplied stills, so separate photographs read as one shoot.
2. Check where the empty space is, because copy sits on these images.
3. **Read every PNG before using it.** A bad frame is replaced from the
   supplied material or raised with the user, never shipped.
4. **Keep the real brand object identical everywhere.** A label that drifts
   between shots is the first thing a client notices.

---

## Real footage the client already has

Supplied footage is usually **flat**: shot log-ish or picture-profiled, with no
white point. Downscaled straight into the page it produces washed-out acts that
no amount of scrim tuning rescues, and the instinct to fix it with a CSS filter
over full-bleed media is the thing taste.md warns against, because a filter
flattens the whole frame.

Grade it into a pre-encode intermediate instead:

```bash
# 1. measure. YMIN/YMAX/YAVG tell you whether the clip ever reaches white
ffmpeg -i raw.mov -vf signalstats,metadata=print:key=lavfi.signalstats.YMAX -f null -

# 2. expand levels + a small saturation lift, and land the fps you want
ffmpeg -y -i raw.mov -vf "colorlevels=rimin=0.09:gimin=0.09:bimin=0.09:\
rimax=0.64:gimax=0.64:bimax=0.64,eq=saturation=1.08,fps=30,scale=1920:-2" \
  -c:v libx264 -crf 16 -an graded.mp4

# 3. then the normal dense-GOP encode for scrubbing
bash <skill>/scripts/encode.sh graded.mp4 assets/01.mp4
```

Three more things real footage needs that generated clips do not:

- **Trim before anyone enters frame.** "Nothing enters or leaves" is a hard
  requirement for a clip the reader can park anywhere in, and real recordings
  routinely have someone walk through at second nine.
- **Target 24 to 30fps before `encode.sh`.** A 60fps phone clip at a dense GOP is
  several times the size for motion no hand can resolve. Decimate with `fps=30`
  in the intermediate; the dense keyframes then cost half as much.
- **Re-encode, never stream-copy.** Cuts made with `-c copy` decode badly under
  a scrubber.

---

## Camera moves

Image and video generation is not part of this guide. Use supplied photos and footage or the project's own screenshots, or ask the user. Never run paid image or video generation without the user's yes for that run with the cost stated.

When choosing and trimming supplied footage for a scrub act, what makes a clip
scrub well is not the same as what makes it watch well:

- **One continuous move, one direction.** A dolly-in, a drift down, a slow
  orbit. Any cut, snap or direction reversal becomes a jolt under the wheel,
  because the reader controls the playhead and will sit on the reversal.
- **Slower than feels right when previewed.** The move is spread over two or
  three viewport-heights of scroll. A move that looks sedate at 24fps feels
  correct under a hand.
- **The subject stays in frame throughout.** The reader may park anywhere.
- **Nothing enters or leaves.** A person walking in is a different shot at
  frame 1 and frame 120, and the poster will match neither.

---

## Encoding

`encode.sh` sets a dense GOP (`-g 8` desktop, `-g 4` mobile), strips audio, and
adds `+faststart`.

The reason is the whole trick: **a normal web encode places a keyframe every two
to five seconds.** Seeking to an arbitrary time makes the decoder walk forward
from the previous keyframe, so a sparse-GOP file plays perfectly and scrubs like
mud. Dense keyframes cost file size and buy responsiveness.

Expect roughly 3MB for a 5s 1080p desktop clip and 1.5MB for the 720p mobile
one. Two clips is about 9MB of video on the page, and the engine fetches each
only as its act approaches.

**Grain-heavy worlds run about double that.** Documentary grain, moving foliage
and film texture gave 5 to 6MB per desktop clip at the script's `-crf 20`;
`-crf 22` is a reasonable dial if a page needs the megabytes back. Longer real
footage costs proportionally more, so a page carrying 15 seconds of supplied
video will sit above the 9MB guideline. That can be the right trade, but make it
deliberately rather than discovering it at the end.

Audio is stripped because these clips are scrubbed, never played. A muted track
is dead weight and an autoplay-policy hazard.

**A stripped ffmpeg will fail here.** Some toolchains put an ffmpeg on PATH with
about 50 filters and no `scale`, `fps` or `tile`. It reports `No option name
near ...`, which reads like a syntax error in your command rather than a missing
filter. `encode.sh` counts filters and goes looking for a real build; override
with `SCROLLCRAFT_FFMPEG`.

---

## Portrait

A 16:9 clip covering a 9:16 viewport crops to the middle third, and a
composition built around negative space on the left loses exactly that space.

Options, in order of cost:

1. **Compose for both.** Keep the subject in the centre third and the copy in a
   bottom band rather than in side negative space, because the bottom band
   survives a centre crop and side space does not. Cheapest, and usually enough.
2. **Native portrait versions.** Use a supplied 9:16 still and clip for the hero
   only. Image and video generation is not part of this guide. Use supplied photos and footage or the project's own screenshots, or ask the user. Never run paid image or video generation without the user's yes for that run with the cost stated.
   Wire them as `data-sc-src-mobile`, and swap the poster with `<picture>` so the
   frame-holder matches the clip it is holding for:

   ```html
   <picture>
     <source media="(max-width: 860px)" srcset="assets/01-hero-p.webp">
     <img class="sc-stage__poster" src="assets/01-hero.webp" alt="">
   </picture>
   <video data-sc-scrub data-sc-src="assets/01.mp4"
          data-sc-src-mobile="assets/01-p.mp4" playsinline muted></video>
   ```

   A portrait poster with a landscape clip (or the reverse) jumps visibly the
   moment the video paints, which is the whole failure the poster exists to
   prevent. `encode.sh` has no portrait mode; do it by hand:

   ```bash
   ffmpeg -y -i src.mp4 -vf "scale=720:-2" -c:v libx264 -crf 20 -g 4 \
     -pix_fmt yuv420p -an -movflags +faststart assets/01-p.mp4
   # cropping a 16:9 source to 9:16 instead of rendering native:
   #   -vf "crop=ih*9/16:ih,scale=720:-2"
   ```
3. **Drop the clip on phones.** Serve the poster and let the copy carry the act.
   Under reduced motion the engine already does exactly this, so the layout is
   known to work.

Also step the hero display size down on phones. `--sc-t-4xl` floors at 3.4rem,
which is a desktop floor: it wraps a normal hero headline to six lines at 390px.
See [taste.md](taste.md).

Do not solve it with `object-fit: contain`. Letterboxed video on a landing page
reads as a broken embed.
