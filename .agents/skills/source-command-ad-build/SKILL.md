---
name: "source-command-ad-build"
description: "Orchestrate the Video Ad Engine end to end. Chains the 7 ad-* agents through the brief-file state machine (video-ads/briefs/{id}.md, status frontmatter) with quality gates, a JSON verdict file, bounded audit retry, and an absolute operator approval gate. Drives Phases 0-5 to In Review. NEVER approves and NEVER publishes autonomously, ever."
---

# source-command-ad-build

Use this skill when the user asks to run the migrated source command `ad-build`.

## Command Template

# /ad-build

The orchestrator for the Video Ad Engine. It makes the seven `ad-*` agents reachable: it runs (or reuses) the trend pool, creates today's briefs, chains the agents through the brief-file status flow, enforces the audit quality gate via a JSON verdict file, and surfaces finished ads to you for approval. It drives Phases 0-5 to `In Review` and STOPS. It does not approve and it does not publish, ever.

This is the ONLY sanctioned way to run the ad-* pipeline. Every gate here (the Novel-brief floor, the true-substance requirement, the anchor requirement, the budget gate, the auto-fail scan, the bounded retry, the absolute approval gate) is bypassed if you invoke the agents by hand. Don't.

The coordination model IS the folder of brief files. Each agent reads one brief, acts, and flips its `status:`. The orchestrator never carries one agent's context to the next: state lives in the briefs, artefacts on disk under `video-ads/`. Agents run in fresh context. Every Task invocation is synchronous (`run_in_background: false`); the pipeline is strictly sequential per brief.

## Arguments

| Flag | Default | Effect |
|---|---|---|
| `--scan` | off | Force a fresh trend scan (Phase 0b) before strategy, even if the pool is fresh. |
| `--date=YYYY-MM-DD` | today | The `day_tag` the run operates on. |
| `--brief=<id>` | none | Skip Phase 1; run Phases 2-5 against one existing brief (status >= Brief Ready, or Regenerate with notes). |
| `--dry-run` | false | Run every agent and gate, but the producer stops at its cost estimate (no generation spend) and nothing is flagged for posting. Briefs still update so the state machine is inspectable. |

## Hard rules (enforced at every gate)

1. **NOTHING IS APPROVED OR PUBLISHED AUTONOMOUSLY. ABSOLUTE.** The auditor PASS sets `In Review`, never `Approved`. No agent and no orchestrator step may set `Approved` or `Live`, or upload anything. This pipeline ENDS at `In Review`. Only you move a brief to `Approved`, and uploading to the ad platform is a separate act you perform outside this command.
2. **No false claims; substance density required.** Every capability stated must be true and carried by a real proof-substitute (named artifact, real number, honest limitation). The auditor M-A01 fails a false claim or a substance-free script. No screen demo is required.
3. **Em-dash count must be 0** in every artefact this pipeline touches (U+2014 and U+2013).
4. **Never name a real person in a spoken line** (M-A05). Borrowed authority lives in burned text only, as a reported habit.
5. **No clip is generated without an approved anchor still.** NEEDS-ANCHOR halts the brief at Phase 3 until you approve one.
6. **The budget cap is hard** (BUDGETS.md). The producer's dry-run gate runs before any spend; the orchestrator NEVER passes a force override.
7. **The audit verdict is read from the FILE**, `video-ads/audits/{id}-verdict.json`, not the auditor's chat message (truncation-safe).
8. **Bounded audit retry: max 2.** After 2 FAILs the auditor sets `escalation: operator-diagnostic`; never a third regeneration.
9. **Field ownership is sacred** (STATE-MODEL matrix). The orchestrator only reads for gating and writes nothing to a brief except `halt_reason` in a rare reconciliation case.

---

## Coordination target

- **Briefs:** `video-ads/briefs/{id}.md` (id `ad-YYYYMMDD-NN`). Status in frontmatter. Schema in `video-ads/foundations/STATE-MODEL.md`.
- **Verdicts:** `video-ads/audits/{id}-verdict.json`. **Assets:** `video-ads/rendered/{id}/`. **Pool:** `video-ads/trends/latest.md`.

Status flow this command drives:
```
[pool fresh] -> Brief Ready -> Script Ready -> Spec Ready -> Asset Ready -> In Review  [STOP]
   (Phase 0b)    (Phase 1)      (Phase 2)       (Phase 3)     (Phase 4)      (Phase 5 PASS)
                                                 OR Regenerate (loop to 2/3/4, max 2)
                                                 OR Regenerate + escalation: operator-diagnostic
                                                 OR halt_reason set (budget, render, NEEDS-ANCHOR)
```
Phase 6 (`Approved`) and `Live` are YOURS ONLY and live OUTSIDE this command.

---

## Phase 0: Pre-flight (always runs, under 30s)
Verify the run can complete before any agent. HALT on any failure, invoke no agent.
```bash
DATE=${ARG_DATE:-$(date +"%Y-%m-%d")}
mkdir -p video-ads/briefs video-ads/audits video-ads/rendered video-ads/trends video-ads/metrics video-ads/overlays .Codex/logs
# Foundations present
for f in METHODOLOGY STATE-MODEL PLAYBOOK BUDGETS RECIPE QUALITY-RUBRIC MISTAKES-LOG PATTERN-LIBRARY HYPOTHESIS-LIBRARY; do
  test -r "video-ads/foundations/${f}.md" || { echo "FATAL: missing ${f}.md"; MISSING=1; }
done
# All 7 agents present
for a in ad-trend-scout ad-strategist ad-scriptwriter ad-director ad-producer ad-auditor ad-analyst; do
  test -r ".Codex/agents/${a}.md" || { echo "FATAL: missing agent ${a}.md"; MISSING=1; }
done
# Brand memory present for the active brand (from memory.md Active Brand or Codex.local.md)
test -r ".Codex/agent-memory/content-creator/brand-memories/${BRAND}.md" || { echo "FATAL: no brand memory for ${BRAND}; run /brand-memory create ${BRAND}"; MISSING=1; }
# Tooling (informational; Phase 4 halts if absent)
command -v ffmpeg >/dev/null || echo "WARN: ffmpeg missing (Phase 4 assembly will HALT)"
command -v ffprobe >/dev/null || echo "WARN: ffprobe missing (Phase 4/5 verification will HALT)"
test -f video-ads/voice/brand-voice.json && echo "Brand voice: locked" || echo "Brand voice: NOT locked (producer resolves by name; lock one for consistency)"
ls video-ads/anchors/*.png >/dev/null 2>&1 && echo "Anchors: present" || echo "WARN: no anchor stills in video-ads/anchors/ (presenter/character formats will HALT with NEEDS-ANCHOR)"
touch .Codex/logs/video-ads-spend.log
[ -n "$MISSING" ] && { echo "Pre-flight FAILED"; exit 1; }
```
Confirm your configured generation CLI or MCP and TTS are reachable per `.Codex/skills/content/video-ad-production/SKILL.md` (a balance or list call). If neither is configured, the run may still proceed to Phase 3 (briefs, scripts, specs are free) and will stop at Phase 4 with a clear report.

## Phase 0b: Trend pool (ad-trend-scout, only if --scan or pool stale)
If `--scan` was passed OR `video-ads/trends/latest.md` is missing or its `Last scanned:` stamp is > 7 days old, invoke `ad-trend-scout` (`subagent_type: ad-trend-scout`). It writes the ranked pool. If it HALTs (all surfaces down), proceed with the prior pool (or priors) and note it.

## Phase 1: Strategy (ad-strategist)
Skip if `--brief` was passed. Invoke `ad-strategist` with the run date, the brand, and "this is an /ad-build run". It reads the pool + analyst patterns + the last 14 days of briefs + playbook and creates 3-5 `Brief Ready` files, each with a prediction record and >= 1 Novel. **Gate:** if it HALTs (no Novel brief, brand memory missing), STOP and report. Otherwise collect the ids: `grep -l "^status: Brief Ready" video-ads/briefs/*.md`.

## Phase 2: Script (ad-scriptwriter)
For each `Brief Ready` brief, invoke `ad-scriptwriter` with the id. It writes `## Script Body` (with the allowed-word list) + `## Hook Variants` + draft `## Caption`, sets `Script Ready`. **Gate:** if it HALTs (proof/claim mismatch, dialogue budget, self-check auto-fail it cannot resolve), skip that brief, report; the brief may need a strategist fix.

## Phase 3: Direction (ad-director)
For each `Script Ready` brief, invoke `ad-director`. It writes the voice-first `## Creative Spec` (assembly mode, beats, anchors, HTML panels, one voice reference, both placements) + finalised `## Caption`, sets `Spec Ready`. **Gate:** if `halt_reason` is set (over the 80-credit ceiling, cascade > 100%, NEEDS-ANCHOR), skip + surface it. NEEDS-ANCHOR is a human step: approve a still into `video-ads/anchors/` and re-run `--brief={id}`.

## Phase 4: Produce (ad-producer)
For each `Spec Ready` brief, invoke `ad-producer` (Haiku). It runs the HARD budget gate, renders the voice, generates the beats with anchors bound (or the single take), renders the HTML panels, upscales, stitches, burns captions, lands `final.mp4` + `final-4x5.mp4`, logs REAL spend, sets `Asset Ready`. **Gate:** on a budget-cap or render HALT (`halt_reason` set, status unchanged), surface to you, skip, continue. Under `--dry-run`, pass the dry-run intent so the producer stops at the cost estimate. Proceed only when `Asset Ready` and `final.mp4` exists non-empty.

## Phase 5: Audit with bounded retry (ad-auditor)
For each `Asset Ready` brief, invoke `ad-auditor` with the id and the explicit instruction: **"Write your verdict to `video-ads/audits/{id}-verdict.json` before you finish. The orchestrator reads that FILE, not your message."**
Read the verdict from the FILE:
```bash
VF="video-ads/audits/${ID}-verdict.json"
test -f "$VF" || { echo "FATAL: ${VF} missing, auditor halted"; HALT_BRIEF=1; }
VERDICT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).verdict)" "$VF")
ROUTE=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).route||'')" "$VF")
```
- `PASS` -> the brief is `In Review`. Proceed to Phase 6 (the human gate). **This is the end of the autonomous run for that brief.**
- `FAIL` + `retry_count < 2` -> the auditor set `Regenerate` + a fix list + a route. Re-invoke the routed agent (ad-scriptwriter / ad-director / ad-producer) with "read `## Audit` first and address every item", then re-run the downstream phases (3 and 4 as needed), then re-audit. The auditor increments `retry_count` and overwrites the verdict file.
- `FAIL` + `retry_count >= 2` -> the auditor set `escalation: operator-diagnostic`. STOP for this brief, escalate with the diagnosis. No third regeneration.
If the verdict file is absent or invalid after one stricter re-invoke, STOP for this brief and escalate (never guess a verdict from the chat).

## Phase 6: Operator approval gate (human, the pipeline STOPS here)
For each `In Review` brief, surface a preview block:
1. The ad (`asset_path` -> `final.mp4` and `final-4x5.mp4` on disk), 2. the caption + CTA exactly as it would run, 3. the audit summary (the 5 scores + average from the verdict file), 4. the brief context (format / angle / hook family / hypothesis / prediction), 5. the generation cost.
Ask: **"Approve, Revise, or Reject?"** The orchestrator does NOT self-approve and does NOT publish. On your answer, record it under `## Operator Decision` (dated), then:
- **Approve:** YOU set `status: Approved`. Upload to the ad platform yourself. When it runs, set `status: Live`, `posted_at`, `live_url`.
- **Revise:** YOU set `status: Regenerate` with notes under Operator Decision (your revisions do not count against the auditor's two retries); re-run `--brief={id}`.
- **Reject:** move the file to `video-ads/briefs/archive/` with the reason; the strategist learns from it next cycle.

## Phase 7: Register the learning loop (ad-analyst, conditional)
For each ad you later set to `Live`, the post-flight loop arms against `posted_at`. Emit:
```
RECOMMEND_SCHEDULED: run ad-analyst day-1 on {id} at live+24h (paste or export metrics to video-ads/metrics/{id}-day-1.md first)
RECOMMEND_SCHEDULED: run ad-analyst day-7 on {id} at live+7d (metrics to video-ads/metrics/{id}-day-7.md first)
```
ad-analyst self-HALTs (INSUFFICIENT_PRECONDITION / not Live / no metrics file) until there is a prediction record AND real data, so registering now is safe. Skip under `--dry-run` (still print).

## Phase 8: Final report
```markdown
## /ad-build complete, {date}
### Trend pool: {fresh, reused | rescanned} ({top 3 trends})
### Strategy: {N} briefs ({format/angle/hook/bucket each}); Novel: {which}; HALT: {none|reason}
### Script: {N} Script Ready; HALT: {none|which}
### Direction: {N} Spec Ready; NEEDS-ANCHOR: {none|which}; budget blocks: {none|which}
### Produce: {N} Asset Ready ({credits} cr, MTD {mtd}/{cap}); halted (budget/render): {none|which}
### Audit: PASS {N}; FAIL -> operator diagnostic {N}; per-brief verdicts (from JSON): {id: PASS/FAIL, cycles}
### Awaiting you (In Review): {N} ({ids + asset paths})  <-- the pipeline stops here
### Learning loop: day-1/7 reminders registered (conditional on Live) for {list}
### Follow-ups for you: {approve anchor X | budget block | diagnostic | approvals pending | metrics to paste}
```

---

## Per-phase HALT / escalation table
| Phase | Trigger | Recovery |
|---|---|---|
| 0 | Missing foundation, agent, brand memory | Fix, re-run. Invoke no agent until clean. |
| 0b | Trend scout HALT (surfaces down) | Proceed on prior pool / priors; note it. |
| 1 | No Novel brief, brand memory missing | STOP; seed a hypothesis or create the brand memory. |
| 2 | Proof/claim mismatch, dialogue budget, unresolved self-check fail | Skip the brief; it needs a strategist fix. |
| 3 | Spec over 80 cr, cascade > 100%, NEEDS-ANCHOR | Skip; surface. Approve an anchor or raise the ceiling yourself, then `--brief={id}`. |
| 4 | Budget cap / render failure / moderation reject | Surface; never force; re-run after the fix. |
| 5 | Verdict file missing after a stricter re-invoke | Escalate; never guess a verdict. |
| 5 | FAIL at retry >= 2 | Escalate with diagnosis; no third regeneration. |
| 6 | Your Reject / Revise | Archive / `Regenerate` with notes and `--brief={id}`. |

## When NOT to run /ad-build
- When no anchor stills are approved and the batch needs presenter or character formats (every clip needs an approved start still).
- When the credit cap is near 100% (check `.Codex/logs/video-ads-spend.log`).
- As a way to "just make an ad". The pipeline is hypothesis-driven and gated, not a quick-render tool.

## Maintenance
Each run appends to the agents' own MEMORY files (they do this themselves). After a run, skim the MEMORY tails to confirm the appends landed. The pipeline ENDS at In Review: approval and the ad-platform upload are yours, always.
