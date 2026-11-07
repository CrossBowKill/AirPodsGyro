#!/bin/bash
# security-scan.sh: read-only pattern scan behind /security-sweep. Optional: the command works
# without it. Needs bash and grep. Writes nothing and sends nothing anywhere.
#
# Prints one tab-separated line per hit and never the text of the hit:
#   SECRET|EXPOSE <tab> label <tab> file:line <tab> tracked|ignored|untracked|no-git <tab> soft|-
#   ENVFILE <tab> env file <tab> file <tab> git state <tab> -
#   KEYFILE <tab> key file <tab> file <tab> git state <tab> -
#   PARTIAL <tab> label
#   DONE <tab> <hit count>
# "soft" means the line also looks like a placeholder or a private host, so a human should
# confirm it. A soft hit is lowered in severity by the sweep, never dropped.
# PARTIAL means a search for that label hit an error, such as a file it could not read, so its
# results may be incomplete.
#
# Usage: bash .claude/scripts/security-scan.sh [--root PATH] [--only FILE]
# Exit 0 after a scan (hits or not), 2 when the patterns file or the --only file is missing.

ROOT="."
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
cd "$ROOT" || exit 2

PATTERNS=".claude/security/patterns.tsv"
if [ ! -f "$PATTERNS" ]; then
  echo "patterns file missing: $PATTERNS" >&2
  exit 2
fi
if [ -n "$ONLY" ] && [ ! -f "$ONLY" ]; then
  echo "file not found: $ONLY" >&2
  exit 2
fi

TAB=$(printf '\t')
SOFT='EXAMPLE|(^|[^.a-z])example([^.]|$)|your[_-]|YOUR[_-]|placeholder|PLACEHOLDER|changeme|CHANGEME|replace[_-]?me|REPLACE_ME|xxxxxxxx|XXXXXXXX|<[A-Za-z_-]+>|\.internal|\.local([:/ ]|$)'
HITS=0
IN_GIT=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IN_GIT=1

git_state() {
  if [ "$IN_GIT" -eq 0 ]; then echo "no-git"; return; fi
  if git ls-files --error-unmatch -- "$1" >/dev/null 2>&1; then echo "tracked"; return; fi
  if git check-ignore -q -- "$1" 2>/dev/null; then echo "ignored"; return; fi
  echo "untracked"
}

# The shipped files that describe the patterns would otherwise match themselves.
is_own_file() {
  case "$1" in
    .claude/security/patterns.tsv|.claude/scripts/security-scan.sh|.claude/commands/security-sweep.md|.claude/hooks/tests/test-security-layer.sh) return 0 ;;
    .claude/system-map/data/*|*/.claude/system-map/data/*) return 0 ;; # the map's own running state, deleted when it stops
  esac
  return 1
}

# file:line pairs only. cut runs before anything leaves the pipe, so the matched text never prints.
# grep exits 2 on an error. A final PARTIAL line carries that out of the pipe.
search() {
  local flags="$1" regex="$2"
  local opts="-nIHE"
  [ "$flags" = "i" ] && opts="-nIHEi"
  if [ -n "$ONLY" ]; then
    command grep $opts -e "$regex" -- "$ONLY" 2>/dev/null | cut -d: -f1,2
  else
    command grep -r $opts \
      --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor --exclude-dir=.venv \
      --exclude-dir=venv --exclude-dir=__pycache__ --exclude-dir=target --exclude-dir=.cache \
      -e "$regex" . 2>/dev/null | cut -d: -f1,2
  fi
  [ "${PIPESTATUS[0]}" -ge 2 ] && echo "PARTIAL"
  return 0
}

while IFS="$TAB" read -r kind label flags regex; do
  case "$kind" in
    SECRET|EXPOSE) ;;
    *) continue ;;
  esac
  [ -n "$regex" ] || continue
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    if [ "$hit" = "PARTIAL" ]; then
      printf 'PARTIAL\t%s\n' "$label"
      continue
    fi
    file="${hit%:*}"
    file="${file#./}"
    line="${hit##*:}"
    case "$line" in
      ''|*[!0-9]*) printf 'PARTIAL\t%s\n' "$label"; continue ;;
    esac
    is_own_file "$file" && continue
    source_file="./$file"
    case "$file" in /*) source_file="$file" ;; esac
    soft="-"
    if sed -n "${line}p" "$source_file" 2>/dev/null | command grep -qE "$SOFT"; then soft="soft"; fi
    printf '%s\t%s\t%s:%s\t%s\t%s\n' "$kind" "$label" "$file" "$line" "$(git_state "$file")" "$soft"
    HITS=$((HITS + 1))
  done < <(search "$flags" "$regex")
done < "$PATTERNS"

if [ -z "$ONLY" ]; then
  # A token saved in the git remote address sits in a file the search above skips.
  if [ -f .git/config ] && command grep -qE '://[^/@ ]+@' .git/config 2>/dev/null; then
    n=$(command grep -nE '://[^/@ ]+@' .git/config | cut -d: -f1 | head -1)
    printf 'SECRET\tcredentials in the git remote address\t.git/config:%s\tgit-config\t-\n' "$n"
    HITS=$((HITS + 1))
  fi
  while IFS= read -r f; do
    f="${f#./}"
    case "$f" in
      */.env.example|.env.example|*/.env.sample|.env.sample|*/.env.template|.env.template) continue ;;
    esac
    printf 'ENVFILE\tenv file\t%s\t%s\t-\n' "$f" "$(git_state "$f")"
  done < <(find . \( -name node_modules -o -name .git -o -name vendor -o -name .venv -o -name venv \) -prune -o -type f -name '.env*' -print 2>/dev/null)
  while IFS= read -r f; do
    f="${f#./}"
    printf 'KEYFILE\tkey file\t%s\t%s\t-\n' "$f" "$(git_state "$f")"
  done < <(find . \( -name node_modules -o -name .git -o -name vendor -o -name .venv -o -name venv \) -prune -o -type f \( -name '*.pem' -o -name '*.p12' -o -name '*.pfx' -o -name '*.keystore' -o -name 'id_rsa' -o -name 'id_ed25519' -o -name 'id_ecdsa' -o -name 'serviceAccount*.json' -o -name 'service-account*.json' -o -name 'credentials.json' \) -print 2>/dev/null)
fi

printf 'DONE\t%s\n' "$HITS"
exit 0
