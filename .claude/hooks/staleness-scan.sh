#!/bin/bash
# Decay ledger scanner (governed forgetting, read-only).
# Reads memory/.staleness.json (map of memory file -> ttl_class), compares
# each registered file's mtime and its newest dated [MMDDYY] entry stamp
# against the TTL, and emits a short report of STALE CANDIDATES.
#
# TTL classes: permanent (never flagged) | 90d | 14d.
# Registered paths may contain a glob (e.g. "memory/*.md"); the scanner
# expands it. Basenames starting with _ and the episodes/ and attic/
# subdirectories are always skipped.
#
# Invoked from /sync (one additive step) and safe to run manually:
#   bash .claude/hooks/staleness-scan.sh
#
# Guarantees:
#   - NEVER deletes, moves, or edits anything. Report only. The move is
#     /forget's job, behind explicit user confirmation.
#   - Report goes to stdout AND to .claude/logs/.staleness-report.md
#     (the file /forget reviews with the user).
#   - Always exits 0. Missing ledger, malformed JSON, or unparseable dates
#     degrade to a note in the report, never an error.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LEDGER="$DIR/memory/.staleness.json"
LOG_DIR="$DIR/.claude/logs"
REPORT="$LOG_DIR/.staleness-report.md"
NOW=$(date +%s)
TODAY=$(date +"%Y-%m-%d %H:%M")

mkdir -p "$LOG_DIR" 2>/dev/null

emit() {
  echo "$1"
  echo "$1" >> "$REPORT" 2>/dev/null
}

: > "$REPORT" 2>/dev/null
emit "# Staleness scan, $TODAY"
emit ""

if [ ! -f "$LEDGER" ]; then
  emit "No decay ledger at memory/.staleness.json. Nothing scanned."
  emit "Seed it with the shipped default (see memory/attic/ docs in CLAUDE.md, Memory Architecture)."
  exit 0
fi

# ttl_days: class -> days. 0 means never stale.
ttl_days() {
  case "$1" in
    permanent) echo 0 ;;
    90d) echo 90 ;;
    14d) echo 14 ;;
    *) echo 90 ;;
  esac
}

# mtime that works on both macOS (BSD stat) and Linux (GNU stat).
file_mtime() {
  # GNU tried FIRST: on GNU coreutils `stat -f` means filesystem status, which
  # prints a multi-line block to STDOUT before exiting 1, poisoning the captured
  # value on Linux and Git Bash. BSD (macOS) fails -c cleanly, so this order is
  # safe on both.
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo "$NOW"
}

# Epoch seconds for an MMDDYY stamp; empty on failure. BSD then GNU date.
stamp_epoch() {
  date -j -f "%m%d%y" "$1" +%s 2>/dev/null && return
  local mm="${1%????}" dd yy rest
  rest="${1#??}"; dd="${rest%??}"; yy="${rest#??}"
  date -d "20${yy}-${mm}-${dd}" +%s 2>/dev/null
}

STALE_COUNT=0
SCANNED=0

# Parse the ledger line by line. Each registered file lives on ONE line:
#   "path": {"ttl_class": "90d"},
# This keeps the scanner jq-free; jq (when present) is only a validator.
if command -v jq >/dev/null 2>&1; then
  jq -e . "$LEDGER" >/dev/null 2>&1 || emit "WARNING: memory/.staleness.json is not valid JSON; parsing line by line anyway."
fi

# Read entries into a variable first so the while loop runs in THIS shell
# (a pipe would fork a subshell and lose the counters).
ENTRIES=$(grep -o '"[^"]*"[[:space:]]*:[[:space:]]*{[[:space:]]*"ttl_class"[[:space:]]*:[[:space:]]*"[^"]*"' "$LEDGER" 2>/dev/null)

while IFS= read -r ENTRY; do
  [ -z "$ENTRY" ] && continue
  RAW_PATH=$(printf '%s' "$ENTRY" | sed 's/^"\([^"]*\)".*/\1/')
  CLASS=$(printf '%s' "$ENTRY" | sed 's/.*"ttl_class"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  DAYS=$(ttl_days "$CLASS")
  [ "$DAYS" = "0" ] && continue

  # Expand globs relative to the project root; skip helpers and ledgers.
  for F in "$DIR"/$RAW_PATH; do
    [ -e "$F" ] || { emit "- MISSING: $RAW_PATH (registered, class $CLASS, file absent). Consider removing it from the ledger via /forget."; continue; }
    BASE=$(basename "$F")
    case "$BASE" in _*|.*) continue ;; esac
    case "$F" in */memory/episodes/*|*/memory/attic/*) continue ;; esac

    SCANNED=$((SCANNED + 1))
    REL="${F#"$DIR"/}"

    # File-level check: mtime older than TTL.
    MTIME=$(file_mtime "$F")
    AGE_DAYS=$(( (NOW - MTIME) / 86400 ))
    if [ "$AGE_DAYS" -gt "$DAYS" ]; then
      STALE_COUNT=$((STALE_COUNT + 1))
      emit "- STALE FILE: $REL (class $CLASS, untouched ${AGE_DAYS}d, TTL ${DAYS}d). Candidate for /forget review."
      continue
    fi

    # Entry-level check: dated [MMDDYY] stamps older than TTL inside a
    # still-active file. Reports a count plus up to 3 examples.
    OLD_LINES=""
    OLD_N=0
    while IFS= read -r STAMP; do
      EP=$(stamp_epoch "$STAMP")
      [ -z "$EP" ] && continue
      S_AGE=$(( (NOW - EP) / 86400 ))
      if [ "$S_AGE" -gt "$DAYS" ]; then
        OLD_N=$((OLD_N + 1))
        if [ "$OLD_N" -le 3 ]; then
          EXAMPLE=$(grep -m1 "\[$STAMP\]" "$F" 2>/dev/null | head -c 120)
          OLD_LINES="$OLD_LINES
    - [$STAMP] $EXAMPLE"
        fi
      fi
    done <<EOF
$(grep -o '\[[0-9][0-9][0-9][0-9][0-9][0-9]\]' "$F" 2>/dev/null | tr -d '[]' | sort -u)
EOF
    if [ "$OLD_N" -gt 0 ]; then
      STALE_COUNT=$((STALE_COUNT + 1))
      emit "- STALE ENTRIES: $REL has $OLD_N dated stamp(s) older than TTL ${DAYS}d (class $CLASS). Examples:$OLD_LINES"
    fi
  done
done <<ENTRIES_EOF
$ENTRIES
ENTRIES_EOF

emit ""
if [ "$STALE_COUNT" -eq 0 ]; then
  emit "Scanned $SCANNED file(s): no stale candidates. Nothing to forget."
else
  emit "Scanned $SCANNED file(s): $STALE_COUNT stale candidate(s)."
  emit "Review candidates with /forget (archive to memory/attic/, never delete)."
fi
emit "This scanner is read-only: it moved and deleted nothing."
exit 0
