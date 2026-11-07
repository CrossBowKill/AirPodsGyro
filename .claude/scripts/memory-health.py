#!/usr/bin/env python3
"""memory-health.py: read-only health report for the Claudify memory layer.

Reads only. Writes nothing. Prints a JSON report to stdout. Standard library only.

Checks:
  1. .claude/memory.md: bytes, line count against the 100 line cap, longest line,
     dated items older than the stale window in the watched sections, undated
     items, relative-time words (TODAY, tomorrow, this week) with no date.
     Dates are read as [MMDDYY], [CURRENT MMDDYY] or [YYYY-MM-DD].
  2. .claude/knowledge-base.md: line count against the 200 line cap.
  3. .claude/knowledge-nominations.md: entries dated older than the stale window.
  4. .claude/agent-memory/*/MEMORY.md: files over the size threshold.

Usage:
  python3 .claude/scripts/memory-health.py [--root PATH] [--stale-days 14]
                                           [--sections "Now,Open Threads,Open Tasks,Blockers,Known Issues"]
  python3 .claude/scripts/memory-health.py --self-test

Exit code 0 on OK, 2 on ATTENTION (so a cron line can notice), 1 on a bad argument.
Used by /memory-reconcile Step 1.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile

DATE_RE = re.compile(r"\[(?:CURRENT\s+)?(\d{2})(\d{2})(\d{2})\]")
ISO_RE = re.compile(r"\[(\d{4})-(\d{2})-(\d{2})\]")
RELATIVE_RE = re.compile(r"\b(TODAY|tomorrow|tonight|this week|next week)\b", re.IGNORECASE)
EMPTY_RE = re.compile(r"^- \((none|none yet|empty)\)\s*$", re.IGNORECASE)

MEMORY_LINE_CAP = 100            # the completeness gate blocks Write above this
SIZE_LIMIT_BYTES = 12000         # about 3,000 tokens; memory.md loads every session
LINE_LIMIT_CHARS = 400           # one line should be one idea
AGENT_MEMORY_LIMIT_BYTES = 40000
KB_CAP_LINES = 200               # the completeness gate blocks above this
DEFAULT_SECTIONS = "Now,Open Threads,Open Tasks,Blockers,Known Issues"


def parse_date(text):
    m = DATE_RE.search(text)
    if m:
        mm, dd, yy = (int(x) for x in m.groups())
        try:
            return dt.date(2000 + yy, mm, dd)
        except ValueError:
            return None
    m = ISO_RE.search(text)
    if m:
        try:
            return dt.date(*(int(x) for x in m.groups()))
        except ValueError:
            return None
    return None


def sections(lines):
    current = None
    for i, line in enumerate(lines, 1):
        if line.startswith("## "):
            current = line[3:].strip()
            continue
        yield current, i, line


def read_text(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def build_report(root, stale_days, watched, today=None):
    today = today or dt.date.today()
    report = {"generated": today.isoformat(), "stale_days": stale_days,
              "sections_watched": sorted(watched), "flags": []}

    mem_path = os.path.join(root, ".claude", "memory.md")
    if os.path.exists(mem_path):
        text = read_text(mem_path)
        lines = text.splitlines()
        stale, long_lines, undated, relative = [], [], [], []
        for sec, n, line in sections(lines):
            if sec not in watched or not line.startswith("- ") or EMPTY_RE.match(line):
                continue
            d = parse_date(line)
            if d and (today - d).days > stale_days:
                stale.append({"line": n, "section": sec, "age_days": (today - d).days,
                              "preview": line[:90]})
            if not d:
                undated.append({"line": n, "section": sec, "preview": line[:90]})
            if RELATIVE_RE.search(line):
                relative.append({"line": n, "section": sec, "preview": line[:90]})
            if len(line) > LINE_LIMIT_CHARS:
                long_lines.append({"line": n, "chars": len(line)})
        report["memory_md"] = {
            "bytes": len(text.encode("utf-8")),
            "lines": len(lines),
            "line_cap": MEMORY_LINE_CAP,
            "longest_line_chars": max((len(l) for l in lines), default=0),
            "stale_items": stale,
            "over_long_lines": long_lines,
            "undated_items": undated,
            "relative_time_words": relative,
        }
        if len(lines) > MEMORY_LINE_CAP - 10:
            report["flags"].append("memory.md within 10 lines of its %d line cap" % MEMORY_LINE_CAP)
        if report["memory_md"]["bytes"] > SIZE_LIMIT_BYTES:
            report["flags"].append("memory.md over %d bytes" % SIZE_LIMIT_BYTES)
        if stale:
            report["flags"].append("%d stale dated items in watched sections" % len(stale))
        if undated:
            report["flags"].append("%d undated items in watched sections (age unknown)" % len(undated))
        if relative:
            report["flags"].append("%d items use relative time words (TODAY, tomorrow, this week)" % len(relative))
        if long_lines:
            report["flags"].append("%d lines over %d chars" % (len(long_lines), LINE_LIMIT_CHARS))
    else:
        report["memory_md"] = None
        report["flags"].append("memory.md missing")

    kb_path = os.path.join(root, ".claude", "knowledge-base.md")
    if os.path.exists(kb_path):
        n = len(read_text(kb_path).splitlines())
        report["knowledge_base"] = {"lines": n, "cap": KB_CAP_LINES}
        if n >= KB_CAP_LINES - 10:
            report["flags"].append("knowledge-base.md within 10 lines of its %d line cap" % KB_CAP_LINES)
    else:
        report["knowledge_base"] = None

    nom_path = os.path.join(root, ".claude", "knowledge-nominations.md")
    if os.path.exists(nom_path):
        old = 0
        for line in read_text(nom_path).splitlines():
            if line.startswith(("- [", "## [", "### [")):
                d = parse_date(line)
                if d and (today - d).days > stale_days:
                    old += 1
        report["nominations"] = {"older_than_window": old}
        if old:
            report["flags"].append("%d nominations older than %d days" % (old, stale_days))
    else:
        report["nominations"] = None

    am_dir = os.path.join(root, ".claude", "agent-memory")
    big = []
    if os.path.isdir(am_dir):
        for name in sorted(os.listdir(am_dir)):
            p = os.path.join(am_dir, name, "MEMORY.md")
            if os.path.exists(p) and os.path.getsize(p) > AGENT_MEMORY_LIMIT_BYTES:
                big.append({"agent": name, "bytes": os.path.getsize(p)})
    report["agent_memory_over_limit"] = big
    if big:
        report["flags"].append("%d agent MEMORY.md files over %d bytes" % (len(big), AGENT_MEMORY_LIMIT_BYTES))

    report["status"] = "ATTENTION" if report["flags"] else "OK"
    return report


def self_test():
    """Builds a throwaway project in a temp dir and checks every detector fires once."""
    today = dt.date(2026, 10, 21)
    with tempfile.TemporaryDirectory() as root:
        os.makedirs(os.path.join(root, ".claude", "agent-memory", "big"))
        with open(os.path.join(root, ".claude", "memory.md"), "w", encoding="utf-8") as f:
            f.write("# Memory\n\n## Now\n"
                    "- [101826] fresh enough item\n"
                    "- [010126] ancient item that should read as stale\n"
                    "- no date on this one at all\n"
                    "- [101526] ship it TODAY before the deadline\n"
                    "\n## Open Threads\n- (none yet)\n\n## Recent Decisions\n- [010126] old decision, section not watched\n")
        with open(os.path.join(root, ".claude", "knowledge-base.md"), "w", encoding="utf-8") as f:
            f.write("# KB\n" + "- rule [Source: test]\n" * 195)
        with open(os.path.join(root, ".claude", "knowledge-nominations.md"), "w", encoding="utf-8") as f:
            f.write("# Nominations\n## Pending\n- [2026-01-01] old nomination\n- [101926] fresh nomination\n")
        with open(os.path.join(root, ".claude", "agent-memory", "big", "MEMORY.md"), "w", encoding="utf-8") as f:
            f.write("x" * (AGENT_MEMORY_LIMIT_BYTES + 1))
        r = build_report(root, 14, set(DEFAULT_SECTIONS.split(",")), today=today)
        checks = [
            (r["status"] == "ATTENTION", "status should be ATTENTION"),
            (len(r["memory_md"]["stale_items"]) == 1, "exactly one stale item (the unwatched section is ignored)"),
            (r["memory_md"]["stale_items"][0]["line"] == 5, "stale item is line 5"),
            (len(r["memory_md"]["undated_items"]) == 1, "exactly one undated item"),
            (len(r["memory_md"]["relative_time_words"]) == 1, "exactly one relative-time item"),
            (r["knowledge_base"]["lines"] >= KB_CAP_LINES - 10, "knowledge base near cap"),
            (any("knowledge-base.md within" in f for f in r["flags"]), "knowledge base cap flag present"),
            (r["nominations"]["older_than_window"] == 1, "one old nomination"),
            (len(r["agent_memory_over_limit"]) == 1, "one oversized agent memory"),
        ]
        failed = [msg for ok, msg in checks if not ok]
        # Clean project must report OK.
        clean = tempfile.mkdtemp()
        os.makedirs(os.path.join(clean, ".claude"))
        with open(os.path.join(clean, ".claude", "memory.md"), "w", encoding="utf-8") as f:
            f.write("# Memory\n\n## Now\n- [101926] current task\n\n## Open Threads\n- (none yet)\n")
        with open(os.path.join(clean, ".claude", "knowledge-base.md"), "w", encoding="utf-8") as f:
            f.write("# KB\n- one rule [Source: test]\n")
        rc = build_report(clean, 14, set(DEFAULT_SECTIONS.split(",")), today=today)
        if rc["status"] != "OK":
            failed.append("clean project should be OK, got flags: %s" % rc["flags"])
    if failed:
        for msg in failed:
            print("SELF-TEST FAIL: " + msg, file=sys.stderr)
        return 1
    print("memory-health self-test: PASS (%d checks)" % (len(checks) + 1))
    return 0


def main():
    ap = argparse.ArgumentParser(description="Read-only health report for the Claudify memory layer.")
    ap.add_argument("--root", default=os.getcwd(), help="project root (default: current directory)")
    ap.add_argument("--stale-days", type=int, default=14)
    ap.add_argument("--sections", default=DEFAULT_SECTIONS,
                    help="comma-separated memory.md sections to watch for stale or undated items")
    ap.add_argument("--self-test", action="store_true", help="run the built-in proof and exit")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    if args.stale_days < 1:
        print("--stale-days must be at least 1", file=sys.stderr)
        return 1
    watched = {s.strip() for s in args.sections.split(",") if s.strip()}
    report = build_report(args.root, args.stale_days, watched)
    json.dump(report, sys.stdout, indent=2)
    print()
    return 0 if report["status"] == "OK" else 2


if __name__ == "__main__":
    sys.exit(main())
