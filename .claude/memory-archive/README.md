# `.claude/memory-archive/`

Where `/memory-reconcile` moves finished or stale items out of `.claude/memory.md`. One file per month: `YYYY-MM.md`.

- Nothing here is loaded at session start. It is history, searchable with grep.
- Items are copied verbatim, under a heading with the date they were archived.
- To restore an item, copy it back into `memory.md`. No other step needed.
- Do not edit archived items. If something turns out to be live again, write a fresh one-line item in `memory.md`.

How this relates to `memory/attic/`: the attic holds whole memory files and knowledge entries retired by `/forget` on the decay ledger's TTL. This folder holds individual `memory.md` lines retired by the daily reconcile. Both archive, neither deletes.
