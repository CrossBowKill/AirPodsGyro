# Content Mistakes Log: every failure becomes a check

Every mistake this system makes, on any content type (posts, threads, blogs, ad cards, reels, captions, launch posts, READMEs), becomes a regression check the content-auditor runs on every future piece. The system gets monotonically smarter: it never makes the same mistake twice.

This file is read by the content-auditor at the start of every audit. It is the auditor's training data. The newsletter pipeline has its own parallel log at `newsletter/foundations/MISTAKES-LOG.md`; this one covers everything else.

## Entry format (fixed)

```
### MISTAKE-NNN: short name
**Piece:** which piece/brand this came from
**What happened:** a sentence
**Why it happened:** root cause (creator blind spot, missing rule, tool quirk, etc.)
**Why it matters:** the impact on the audience/brand/system
**Auditor check:** the specific mechanical or semantic check that prevents recurrence
**Severity:** Critical / High / Medium / Low
**Status:** Open (still possible to recur) / Closed (auditor check confirmed working)
```

Every entry MUST carry an Auditor check. An entry without a runnable check is an anecdote, not a defense.

## How the auditor uses this

```
for each MISTAKE-NNN entry below:
  run its Auditor check against the piece under audit
  if the check fails: the mistake has recurred
    -> escalate to INCIDENT (not just FAIL); the original fix was scope-limited
    -> the recurrence contributes to the relevant rubric dimension score
```

If any Critical-severity mistake recurs, the verdict is FAIL regardless of rubric scores.

## Protection tiers

Each entry sits at one of three tiers. Logging alone is not learning.

- **Tier 1 (strongest):** a PreToolUse hook blocks the pattern at write time. The mistake cannot reach disk.
- **Tier 2 (strong):** the content-auditor runs the entry's check every audit. The mistake reaches disk but never ships.
- **Tier 3 (weakest):** documented here only; relies on agents reading and applying judgment. Acceptable for judgment-dependent failure modes, unacceptable for mechanical patterns.

New entries start at Tier 3 (or Tier 2 if the check is immediately mechanical). Lift Tier 3 to Tier 2 by adding the check to the auditor's matrix. Lift Tier 2 to Tier 1 by adding a fast, false-positive-safe PreToolUse hook registered in `.claude/settings.json`, and record the hook filename in the entry.

## How to add a new entry

When the auditor catches a new failure pattern, or the user flags something in review not already covered:

1. Pick the next available MISTAKE-NNN number (start at MISTAKE-001)
2. Fill in the fixed format above
3. Mark Status Open until the check is confirmed working, then Closed
4. Keep the check specific enough to run mechanically where possible (a grep pattern, a count, a comparison), semantic where it must be
5. Closed entries stay forever; they are history and permanent regression anchors

The content-auditor may propose entries in its verdict under "PROPOSED NEW MISTAKE ENTRY"; the user approves before the entry is added.

---

## Entries

_(none yet; the log starts empty and grows from real failures, never from hypotheticals)_
