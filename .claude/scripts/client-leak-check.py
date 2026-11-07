#!/usr/bin/env python3
"""client-leak-check.py: read-only check that one client's knowledge space never mentions another.

Standard library only. Writes nothing. Prints a JSON report. Exit 0 when clean, 1 when a
leak is found, 2 when the clients folder is missing.

How clients are discovered: every folder under `clients/` except `_TEMPLATE` is a client space.
Its slug is the folder name. Its terms are read from the space's `CLAUDE.md`:
  - the display name from the first heading `# Client: <name> (<slug>)`
  - every bullet under a `## Leak-check terms` section (brand names, product names, account
    ids, domains: anything that would identify this client inside another client's files)
Terms shorter than 4 characters are ignored (too many false positives). A term that two
clients share is ignored for both.

What is scanned: every text file inside each client's own `clients/<slug>/` folder, plus any
extra folders listed under `## Also scan` in that client's CLAUDE.md (one relative path per
bullet), for another client's terms. Files listed one per line in `clients/leak-allow.txt`
are skipped, for internal documents meant to list the whole roster.

Usage: python3 .claude/scripts/client-leak-check.py [--root PATH] [--self-test]
"""
import argparse
import json
import os
import re
import sys
import tempfile

TEXT_EXT = {".md", ".txt", ".html", ".json", ".csv", ".yml", ".yaml", ".js", ".mjs", ".ts", ".tsx", ".py"}
MIN_TERM_LEN = 4
MAX_FILE_BYTES = 2_000_000
HEADING_RE = re.compile(r"^#\s*Client:\s*(.+?)\s*\(([A-Za-z0-9_-]+)\)\s*$", re.MULTILINE)
GENERIC = {"name", "slug", "client", "template", "{name}", "{slug}"}


def read_text(path):
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.read()


def section_bullets(text, heading):
    """Bullets under `## <heading>` until the next `## `."""
    out, inside = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            inside = line[3:].strip().lower() == heading.lower()
            continue
        if inside and line.strip().startswith("- "):
            item = line.strip()[2:].strip()
            if item and not item.startswith("[NEEDS"):
                out.append(item)
    return out


def load_clients(root):
    base = os.path.join(root, "clients")
    if not os.path.isdir(base):
        return None
    clients = {}
    for slug in sorted(os.listdir(base)):
        folder = os.path.join(base, slug)
        if not os.path.isdir(folder) or slug.startswith(("_", ".")):
            continue
        terms, extra = set(), []
        if len(slug) >= MIN_TERM_LEN:
            terms.add(slug)
        claude_md = os.path.join(folder, "CLAUDE.md")
        if os.path.exists(claude_md):
            text = read_text(claude_md)
            m = HEADING_RE.search(text)
            if m:
                name = m.group(1).strip()
                if len(name) >= MIN_TERM_LEN and name.lower() not in GENERIC:
                    terms.add(name)
            for t in section_bullets(text, "Leak-check terms"):
                if len(t) >= MIN_TERM_LEN and t.lower() not in GENERIC:
                    terms.add(t)
            extra = section_bullets(text, "Also scan")
        clients[slug] = {"terms": terms, "folders": [folder] + [os.path.join(root, p) for p in extra]}
    return clients


def shared_terms(clients):
    owner, shared = {}, set()
    for slug, c in clients.items():
        for t in c["terms"]:
            key = t.lower()
            if key in owner and owner[key] != slug:
                shared.add(key)
            owner[key] = slug
    return shared


def scan(root, clients, allowed):
    shared = shared_terms(clients)
    findings, scanned = [], 0
    for slug, c in clients.items():
        others = {}
        for o, oc in clients.items():
            if o == slug:
                continue
            for t in oc["terms"]:
                if t.lower() not in shared:
                    others[t] = o
        if not others:
            continue
        pattern = re.compile(r"(?<![A-Za-z0-9])(" + "|".join(re.escape(t) for t in sorted(others, key=len, reverse=True)) + r")(?![A-Za-z0-9])",
                             re.IGNORECASE)
        lookup = {t.lower(): o for t, o in others.items()}
        for folder in c["folders"]:
            if not os.path.isdir(folder):
                continue
            for dirpath, dirnames, files in os.walk(folder):
                dirnames[:] = [d for d in dirnames if d != "node_modules" and not d.startswith(".")]
                for fn in files:
                    if os.path.splitext(fn)[1].lower() not in TEXT_EXT:
                        continue
                    p = os.path.join(dirpath, fn)
                    rel = os.path.relpath(p, root)
                    if rel in allowed or os.path.getsize(p) > MAX_FILE_BYTES:
                        continue
                    scanned += 1
                    try:
                        with open(p, encoding="utf-8", errors="ignore") as f:
                            for n, line in enumerate(f, 1):
                                for m in pattern.finditer(line):
                                    findings.append({"space": slug, "file": rel, "line": n,
                                                     "term": m.group(1), "mentions_client": lookup.get(m.group(1).lower(), "?")})
                    except OSError:
                        continue
    return findings, scanned


def build_report(root):
    clients = load_clients(root)
    if clients is None:
        return {"status": "NO_CLIENTS_FOLDER", "reason": "no clients/ folder under %s" % root}
    allow_path = os.path.join(root, "clients", "leak-allow.txt")
    allowed = set()
    if os.path.exists(allow_path):
        allowed = {l.strip() for l in read_text(allow_path).splitlines() if l.strip() and not l.startswith("#")}
    findings, scanned = scan(root, clients, allowed)
    return {"status": "LEAK" if findings else "CLEAN", "clients": sorted(clients),
            "files_scanned": scanned, "total_findings": len(findings), "findings": findings[:200]}


def self_test():
    failed = []
    with tempfile.TemporaryDirectory() as root:
        def mk(rel, body):
            p = os.path.join(root, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(body)
        mk("clients/_TEMPLATE/CLAUDE.md", "# Client: {name} ({slug})\n")
        mk("clients/northwind/CLAUDE.md", "# Client: Northwind Traders (northwind)\n\n## Leak-check terms\n- Northwind\n- NWT-4421\n")
        mk("clients/contoso/CLAUDE.md", "# Client: Contoso Bakery (contoso)\n\n## Leak-check terms\n- Contoso\n\n## Also scan\n- assets/contoso\n")
        mk("clients/northwind/history.md", "- 2026-10-01: moved the reporting cadence to weekly (own notes)\n")
        mk("clients/contoso/decisions.md", "| 2026-10-02 | copied the Northwind weekly format | it worked for NWT-4421 | owner | notes |\n")
        mk("assets/contoso/brief.md", "Brief for Contoso. Compare with northwind numbers.\n")
        mk("clients/roster.md", "Northwind, Contoso\n")  # not inside a client space: never scanned
        r = build_report(root)
        if r["status"] != "LEAK":
            failed.append("expected LEAK, got %s" % r["status"])
        hits = {(f["space"], f["file"], f["term"].lower()) for f in r["findings"]}
        want = {("contoso", "clients/contoso/decisions.md", "northwind"),
                ("contoso", "clients/contoso/decisions.md", "nwt-4421"),
                ("contoso", "assets/contoso/brief.md", "northwind")}
        missing = want - hits
        if missing:
            failed.append("missing findings: %s" % sorted(missing))
        if any(f["space"] == "northwind" for f in r["findings"]):
            failed.append("northwind space wrongly flagged")
        if any("roster.md" in f["file"] for f in r["findings"]):
            failed.append("file outside client spaces was scanned")
        # allow-list silences a listed file
        mk("clients/leak-allow.txt", "assets/contoso/brief.md\n")
        r2 = build_report(root)
        if any(f["file"] == "assets/contoso/brief.md" for f in r2["findings"]):
            failed.append("allow-list not honoured")
        # clean after fixing the decision line
        mk("clients/contoso/decisions.md", "| 2026-10-02 | adopted a weekly format | it worked for {other_client} | owner | notes |\n")
        r3 = build_report(root)
        if r3["status"] != "CLEAN":
            failed.append("expected CLEAN after fix, got %s: %s" % (r3["status"], r3["findings"]))
    if failed:
        for msg in failed:
            print("SELF-TEST FAIL: " + msg, file=sys.stderr)
        return 1
    print("client-leak-check self-test: PASS (leak found, extra folders scanned, allow-list, clean after fix)")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Read-only cross-client mention check over clients/<slug>/ spaces.")
    ap.add_argument("--root", default=os.getcwd(), help="project root (default: current directory)")
    ap.add_argument("--self-test", action="store_true", help="run the built-in proof and exit")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    report = build_report(os.path.abspath(args.root))
    print(json.dumps(report, indent=2))
    if report["status"] == "NO_CLIENTS_FOLDER":
        return 2
    return 1 if report["status"] == "LEAK" else 0


if __name__ == "__main__":
    sys.exit(main())
