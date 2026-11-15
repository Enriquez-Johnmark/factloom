# Roadmap scripts

Two Python scripts that keep `docs/roadmap/` consistent. They need Python 3 and no package. They are not part of `pnpm check`.

Run both after changing a work item's status, from the repository root:

```sh
python3 scripts/roadmap/check.py
```

```sh
python3 scripts/roadmap/gen_index.py
```

| Script | Does |
|---|---|
| `check.py` | Reads every epic file and checks it against the rules of the roadmap: identifiers, statuses, dependencies, requirement lists and links. Prints `PASS` or `FAIL` per check and ends with `ALL CHECKS PASS` when none failed. Writes what it read to `factloom-roadmap-items.json` in the system's temporary directory. |
| `gen_index.py` | Rewrites the top of `docs/roadmap/ROADMAP.md` from that file: the status line, the tables per epic and the dependency order. It keeps the hand-written part of the file from "Traceability" onwards. Run `check.py` first. |

When work items or requirements are added, change `LAST_ITEM` and `LAST_REQ` at the top of `check.py`.

The order used so far for one work item: change its status and add its evidence in the epic file, run both scripts, then commit the epic file and `ROADMAP.md` as two commits.
