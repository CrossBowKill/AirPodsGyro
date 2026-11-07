#!/usr/bin/env python3
"""pulse-check.py: daily "did it fire" check for every automation you run.

The failure this exists for: a follow-up automation quietly stops, nothing errors loudly,
and the damage shows up months later. This reads your `.claude/automations.yml`, asks each
entry "when did you last actually run, and did it work?", gives it a verdict, and diffs the
verdicts against the previous snapshot so a NEW failure is never buried in a known list.

Standard library only. Read-only on everything except its own snapshot files under
`.claude/logs/pulse/`.

Verdicts, checked in this order, first match wins:
  INACTIVE   `active: false` in the config. Reported, never flagged.
  UNCHECKED  the script cannot check it itself (n8n through the MCP, or an http check when
             run with --no-network). The /pulse command fills these in.
  FAILING    the last run errored (cron-log: error words in the last line; http: non-matching
             status, connection error, or timeout; manual: `status: failing`).
  SILENT     no run on record inside `silent_after_hours` (default 168).
  STALE      ran, but longer ago than expected_interval_hours x grace_factor.
  OK         everything else.

Change markers against the previous snapshot: NEW (first time seen), NEW-FAILURE (was OK
or STALE, now FAILING or SILENT), RECOVERED (was FAILING or SILENT, now OK or STALE),
UNCHANGED.

Usage:
  python3 .claude/scripts/pulse-check.py [--root PATH] [--config .claude/automations.yml]
                                         [--no-network] [--dry-run] [--self-test]
Exit code is always 0 unless the config is unreadable (exit 1); the verdicts carry the signal.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request

HOUR = 3600.0
ERROR_RE = re.compile(r"\b(error|failed|failure|exception|traceback|fatal)\b", re.IGNORECASE)
ISO_TS_RE = re.compile(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?")
ISO_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
EPOCH_RE = re.compile(r"\b(1[5-9]\d{8}|2\d{9})\b")
DEFAULTS = {"grace_factor": 1.5, "silent_after_hours": 168, "expected_interval_hours": 168,
            "http_timeout_seconds": 10, "log_tail_lines": 20}
FLAGGED = ("FAILING", "SILENT")


# ---------- tiny YAML subset: a `defaults:` map and an `automations:` list of flat maps ----

def _scalar(raw):
    v = raw.strip()
    if v == "":
        return ""
    if (v[0] == v[-1]) and v[0] in "\"'" and len(v) > 1:
        return v[1:-1]
    if v.lower() in ("true", "yes"):
        return True
    if v.lower() in ("false", "no"):
        return False
    if v.lower() in ("null", "~"):
        return None
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d+\.\d+", v):
        return float(v)
    return v


def _strip_comment(line):
    out, quote = [], None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            out.append(ch)
        elif ch == "#":
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def parse_config(text):
    """Returns (defaults, automations). `defaults:` is a flat map; `automations:` a list."""
    lines = text.splitlines()
    defaults, autos, mode, item = {}, [], None, None
    for raw in lines:
        line = _strip_comment(raw)
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        body = line.strip()
        if indent == 0:
            m = re.match(r"^([A-Za-z0-9_.-]+):\s*(.*)$", body)
            if not m:
                raise ValueError("cannot parse line: %r" % raw)
            mode = m.group(1)
            item = None
            continue
        if mode == "defaults":
            m = re.match(r"^([A-Za-z0-9_.-]+):\s*(.*)$", body)
            if not m:
                raise ValueError("cannot parse defaults line: %r" % raw)
            defaults[m.group(1)] = _scalar(m.group(2))
        elif mode == "automations":
            if body.startswith("- "):
                item = {}
                autos.append(item)
                body = body[2:].strip()
                if not body:
                    continue
            if item is None:
                raise ValueError("automation field outside an item: %r" % raw)
            m = re.match(r"^([A-Za-z0-9_.-]+):\s*(.*)$", body)
            if not m:
                raise ValueError("cannot parse automation line: %r" % raw)
            item[m.group(1)] = _scalar(m.group(2))
        # any other top-level key is ignored on purpose
    return defaults, autos


# ---------- adapters -----------------------------------------------------------------------

def _parse_ts(text):
    m = ISO_TS_RE.search(text)
    if m:
        try:
            return dt.datetime.strptime(m.group(1) + " " + m.group(2) + ":" + m.group(3), "%Y-%m-%d %H:%M").timestamp()
        except ValueError:
            pass
    m = EPOCH_RE.search(text)
    if m:
        return float(m.group(1))
    m = ISO_DATE_RE.search(text)
    if m:
        try:
            return dt.datetime.strptime(m.group(1), "%Y-%m-%d").timestamp()
        except ValueError:
            pass
    return None


def check_cron_log(auto, root, cfg, now):
    path = auto.get("path")
    if not path:
        return "UNCHECKED", "cron-log check has no `path`", None
    p = path if os.path.isabs(path) else os.path.join(root, path)
    if not os.path.exists(p):
        return "SILENT", "log file not found: %s (the job never wrote, or writes elsewhere)" % path, None
    tail = []
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.strip():
                    tail.append(line.rstrip("\n"))
                    if len(tail) > int(cfg["log_tail_lines"]):
                        tail.pop(0)
    except OSError as e:
        return "UNCHECKED", "log unreadable: %s" % e, None
    last_line = tail[-1] if tail else ""
    last_ts = _parse_ts(last_line) if last_line else None
    if last_ts is None:
        last_ts = os.path.getmtime(p)
    if last_line and ERROR_RE.search(last_line):
        return "FAILING", "last log line reports an error: %s" % last_line[:120], last_ts
    return None, "last log line: %s" % (last_line[:80] if last_line else "(empty file)"), last_ts


def check_http(auto, root, cfg, now, no_network):
    url = auto.get("url")
    if not url:
        return "UNCHECKED", "http check has no `url`", None
    if no_network:
        return "UNCHECKED", "network disabled (--no-network)", None
    expected = int(auto.get("expected_status", 200))
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "claudify-pulse/1"})
    try:
        with urllib.request.urlopen(req, timeout=float(cfg["http_timeout_seconds"])) as resp:
            status = resp.getcode()
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:  # connection refused, DNS, timeout
        return "FAILING", "request failed: %s" % (str(e)[:120]), None
    if status != expected:
        return "FAILING", "HTTP %d, expected %d" % (status, expected), now
    return "OK", "HTTP %d" % status, now


def check_manual(auto, root, cfg, now):
    if str(auto.get("status", "")).lower() == "failing":
        return "FAILING", "marked failing by hand: %s" % auto.get("note", ""), None
    lc = auto.get("last_confirmed")
    if not lc:
        return "SILENT", "manual check with no `last_confirmed` date", None
    ts = _parse_ts(str(lc))
    if ts is None:
        return "UNCHECKED", "cannot read last_confirmed: %r" % lc, None
    return None, "last confirmed by hand on %s" % lc, ts


def verdict_for(auto, root, cfg, now, no_network):
    if auto.get("active", True) is False:
        return "INACTIVE", "switched off in automations.yml", None
    check = str(auto.get("check", "")).lower()
    if check == "cron-log":
        v, reason, ts = check_cron_log(auto, root, cfg, now)
    elif check == "http":
        v, reason, ts = check_http(auto, root, cfg, now, no_network)
    elif check == "manual":
        v, reason, ts = check_manual(auto, root, cfg, now)
    elif check == "n8n-mcp":
        return "UNCHECKED", "read through the n8n MCP by /pulse (workflow: %s)" % auto.get("workflow_name", auto.get("name")), None
    else:
        return "UNCHECKED", "unknown check type %r (use cron-log, http, manual, or n8n-mcp)" % check, None
    if v is not None:
        return v, reason, ts
    expected = float(auto.get("expected_interval_hours", cfg["expected_interval_hours"]))
    grace = float(auto.get("grace_factor", cfg["grace_factor"]))
    silent_after = float(auto.get("silent_after_hours", cfg["silent_after_hours"]))
    hours = (now - ts) / HOUR if ts is not None else None
    if hours is None or hours > silent_after:
        return "SILENT", "no run inside %dh (%s)" % (silent_after, reason), ts
    if hours > expected * grace:
        return "STALE", "last run %.0fh ago; expected every %.0fh (stale after %.0fh)" % (hours, expected, expected * grace), ts
    return "OK", "last run %.0fh ago, %s" % (hours, reason), ts


# ---------- report -------------------------------------------------------------------------

def change_marker(prev, cur):
    if prev is None:
        return "NEW"
    if prev == cur:
        return "UNCHANGED"
    if cur in FLAGGED and prev not in FLAGGED:
        return "NEW-FAILURE"
    if prev in FLAGGED and cur not in FLAGGED:
        return "RECOVERED"
    return "UNCHANGED"


def build_report(root, config_path, now=None, no_network=False, previous=None):
    now = now if now is not None else dt.datetime.now().timestamp()
    with open(config_path, encoding="utf-8") as f:
        defaults, autos = parse_config(f.read())
    cfg = dict(DEFAULTS)
    cfg.update({k: v for k, v in defaults.items() if v is not None})
    prev_map = {a["name"]: a["verdict"] for a in (previous or {}).get("automations", []) if "name" in a}
    rows, flags = [], []
    for auto in autos:
        name = str(auto.get("name") or "(unnamed)")
        v, reason, ts = verdict_for(auto, root, cfg, now, no_network)
        marker = change_marker(prev_map.get(name), v)
        row = {"name": name, "kind": auto.get("kind", ""), "check": auto.get("check", ""),
               "critical": bool(auto.get("critical", False)), "verdict": v, "change": marker,
               "reason": reason,
               "last_run_at": dt.datetime.fromtimestamp(ts).isoformat(timespec="minutes") if ts else None}
        rows.append(row)
        if v in FLAGGED:
            flags.append("%s: %s %s (%s): %s" % ("RED" if marker == "NEW-FAILURE" or row["critical"] else "AMBER", name, v, marker, reason))
        elif v == "STALE":
            flags.append("AMBER: %s STALE (%s): %s" % (name, marker, reason))
    status = "RED" if any(f.startswith("RED") for f in flags) else ("AMBER" if flags else "GREEN")
    count = lambda v: sum(1 for r in rows if r["verdict"] == v)
    return {
        "generated_at": dt.datetime.fromtimestamp(now).isoformat(timespec="seconds"),
        "config": os.path.relpath(config_path, root) if os.path.isabs(config_path) else config_path,
        "status": status,
        "summary": {"total": len(rows), "ok": count("OK"), "stale": count("STALE"), "failing": count("FAILING"),
                    "silent": count("SILENT"), "inactive": count("INACTIVE"), "unchecked": count("UNCHECKED"),
                    "new_failures": [r["name"] for r in rows if r["change"] == "NEW-FAILURE"],
                    "recovered": [r["name"] for r in rows if r["change"] == "RECOVERED"],
                    "critical_failing": [r["name"] for r in rows if r["critical"] and r["verdict"] in FLAGGED]},
        "flags": flags,
        "automations": rows,
    }


def load_previous(snap_dir):
    p = os.path.join(snap_dir, "latest.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_snapshot(snap_dir, report):
    os.makedirs(snap_dir, exist_ok=True)
    day = report["generated_at"][:10]
    body = json.dumps(report, indent=2) + "\n"
    with open(os.path.join(snap_dir, "latest.json"), "w", encoding="utf-8") as f:
        f.write(body)
    with open(os.path.join(snap_dir, day + ".json"), "w", encoding="utf-8") as f:
        f.write(body)


# ---------- self-test ----------------------------------------------------------------------

SELF_TEST_CONFIG = """# fixture
defaults:
  grace_factor: 1.5
  silent_after_hours: 168
automations:
  - name: Fresh backup
    kind: cron
    check: cron-log
    path: logs/backup.log
    expected_interval_hours: 24
  - name: Stale report
    kind: cron
    check: cron-log
    path: logs/report.log
    expected_interval_hours: 24
  - name: Broken sync
    kind: cron
    check: cron-log
    path: logs/sync.log
    expected_interval_hours: 24
    critical: true
  - name: Never ran
    kind: cron
    check: cron-log
    path: logs/missing.log
  - name: Weekly invoices
    kind: manual
    check: manual
    last_confirmed: 2026-10-15
    expected_interval_hours: 72
  - name: Site health
    kind: http
    check: http
    url: http://127.0.0.1:9/healthz
  - name: Lead sync
    kind: n8n
    check: n8n-mcp
    workflow_name: "Lead Sync"
  - name: Old cron
    kind: cron
    check: cron-log
    path: logs/old.log
    active: false
"""


def self_test():
    now = dt.datetime(2026, 10, 21, 9, 0).timestamp()
    failed = []
    with tempfile.TemporaryDirectory() as root:
        os.makedirs(os.path.join(root, "logs"))
        cfg_path = os.path.join(root, "automations.yml")
        with open(cfg_path, "w", encoding="utf-8") as f:
            f.write(SELF_TEST_CONFIG)
        with open(os.path.join(root, "logs", "backup.log"), "w", encoding="utf-8") as f:
            f.write("2026-10-21 02:00 backup ok\n")
        with open(os.path.join(root, "logs", "report.log"), "w", encoding="utf-8") as f:
            f.write("2026-10-18 02:00 report ok\n")
        with open(os.path.join(root, "logs", "sync.log"), "w", encoding="utf-8") as f:
            f.write("2026-10-21 08:00 sync started\n2026-10-21 08:01 ERROR token rejected\n")
        r = build_report(root, cfg_path, now=now, no_network=True, previous=None)
        v = {a["name"]: a["verdict"] for a in r["automations"]}
        c = {a["name"]: a["change"] for a in r["automations"]}
        expect = {"Fresh backup": "OK", "Stale report": "STALE", "Broken sync": "FAILING", "Never ran": "SILENT",
                  "Weekly invoices": "STALE", "Site health": "UNCHECKED", "Lead sync": "UNCHECKED", "Old cron": "INACTIVE"}
        for name, want in expect.items():
            if v.get(name) != want:
                failed.append("%s: expected %s, got %s (%s)" % (name, want, v.get(name), next(a["reason"] for a in r["automations"] if a["name"] == name)))
        if any(x != "NEW" for x in c.values()):
            failed.append("first run should mark every entry NEW")
        if r["status"] != "RED":
            failed.append("status should be RED with a critical failure, got %s" % r["status"])
        if r["summary"]["critical_failing"] != ["Broken sync"]:
            failed.append("critical_failing should list Broken sync")
        # second run: the sync recovers, the backup breaks -> RECOVERED + NEW-FAILURE
        with open(os.path.join(root, "logs", "sync.log"), "a", encoding="utf-8") as f:
            f.write("2026-10-21 08:30 sync ok\n")
        with open(os.path.join(root, "logs", "backup.log"), "a", encoding="utf-8") as f:
            f.write("2026-10-21 08:45 backup FAILED disk full\n")
        r2 = build_report(root, cfg_path, now=now, no_network=True, previous=r)
        c2 = {a["name"]: a["change"] for a in r2["automations"]}
        if c2.get("Broken sync") != "RECOVERED":
            failed.append("Broken sync should be RECOVERED, got %s" % c2.get("Broken sync"))
        if c2.get("Fresh backup") != "NEW-FAILURE":
            failed.append("Fresh backup should be NEW-FAILURE, got %s" % c2.get("Fresh backup"))
        if c2.get("Stale report") != "UNCHANGED":
            failed.append("Stale report should be UNCHANGED, got %s" % c2.get("Stale report"))
        if r2["summary"]["new_failures"] != ["Fresh backup"] or r2["summary"]["recovered"] != ["Broken sync"]:
            failed.append("summary new_failures/recovered wrong: %s" % r2["summary"])
        # snapshot round trip
        snap = os.path.join(root, "snap")
        write_snapshot(snap, r2)
        back = load_previous(snap)
        if not back or back["summary"]["total"] != 8:
            failed.append("snapshot round trip failed")
        # live http path against a closed local port must be FAILING, never a crash
        r3 = build_report(root, cfg_path, now=now, no_network=False, previous=None)
        if {a["name"]: a["verdict"] for a in r3["automations"]}.get("Site health") != "FAILING":
            failed.append("closed port should read FAILING")
    if failed:
        for msg in failed:
            print("SELF-TEST FAIL: " + msg, file=sys.stderr)
        return 1
    print("pulse-check self-test: PASS (verdicts, diff markers, snapshot, http failure path)")
    return 0


def main():
    ap = argparse.ArgumentParser(description='Daily "did it fire" check for every automation in automations.yml.')
    ap.add_argument("--root", default=os.getcwd(), help="project root (default: current directory)")
    ap.add_argument("--config", default=os.path.join(".claude", "automations.yml"), help="config path, relative to root")
    ap.add_argument("--snapshots", default=os.path.join(".claude", "logs", "pulse"), help="snapshot folder, relative to root")
    ap.add_argument("--no-network", action="store_true", help="do not perform http checks (they report UNCHECKED)")
    ap.add_argument("--dry-run", action="store_true", help="print the report but do not write a snapshot")
    ap.add_argument("--self-test", action="store_true", help="run the built-in proof and exit")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    root = os.path.abspath(args.root)
    cfg = args.config if os.path.isabs(args.config) else os.path.join(root, args.config)
    snap_dir = args.snapshots if os.path.isabs(args.snapshots) else os.path.join(root, args.snapshots)
    if not os.path.exists(cfg):
        print(json.dumps({"status": "UNCONFIGURED", "reason": "no automations.yml at %s; copy the template and list your automations" % args.config}, indent=2))
        return 0
    try:
        report = build_report(root, cfg, no_network=args.no_network, previous=load_previous(snap_dir))
    except ValueError as e:
        print(json.dumps({"status": "ERROR", "reason": "automations.yml unreadable: %s" % e}, indent=2))
        return 1
    if not args.dry_run:
        write_snapshot(snap_dir, report)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
