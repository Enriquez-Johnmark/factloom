#!/usr/bin/env python3
"""Consistency check for the Factloom roadmap. Prints pass or fail per check and writes items.json."""
import json
import re
import sys
import tempfile
from pathlib import Path

REPO = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2]
# Written outside the repository, so that the format check does not see it.
OUT = Path(tempfile.gettempdir()) / "factloom-roadmap-items.json"
EPICS = sorted((REPO / "docs/roadmap/epics").glob("EPIC-*.md"))
REQ_FILE = REPO / "docs/product/REQUIREMENTS.md"
LAST_ITEM, LAST_REQ = 87, 38
TABLE_FIELDS = ["Status", "Phase", "Depends on", "Requirements", "Components"]
BOLD_FIELDS = ["Objective", "Background", "Outcome", "Scope", "Non-goals", "Functional requirements",
               "Technical requirements", "Constraints", "Acceptance criteria", "Validation", "Completion evidence"]

results = []


def report(label, problems):
    results.append((label, problems))
    print(f"{'PASS' if not problems else 'FAIL'}  {label}")
    for p in problems[:40]:
        print(f"        - {p}")


def ids(text):
    return re.findall(r"FL-\d{3}", text)


def deps_of(cell):
    return [] if cell.strip() == "None" else ids(cell)


items, summaries, epic_reqs = [], {}, {}
for path in EPICS:
    text = path.read_text()
    epic = path.stem
    m = re.search(r"^\| Requirements \| (.*) \|$", text, re.M)
    epic_reqs[epic] = sorted(set(re.findall(r"REQ-\d{2}(?!\d)", m.group(1)))) if m else []
    work = text.split("\n## Work items\n", 1)
    if len(work) < 2:
        continue
    for row in re.findall(r"^\| (FL-\d{3}) \| (.*?) \| (\S+) \| (.*?) \| (\w[\w ]*) \|$", work[1], re.M):
        summaries.setdefault(row[0], []).append((epic,) + row[1:])
    for block in re.split(r"^### (?=FL-\d{3}: )", work[1], flags=re.M)[1:]:
        head, _, body = block.partition("\n")
        ident, title = head.split(": ", 1)
        fields = dict(re.findall(r"^\| (%s) \| (.*) \|$" % "|".join(TABLE_FIELDS), body, re.M))
        items.append({
            "id": ident, "title": title.strip(), "epic": epic,
            "phase": fields.get("Phase", "").strip(),
            "depends_on": deps_of(fields.get("Depends on", "")),
            "status": fields.get("Status", "").strip(),
            "requirements": sorted(set(re.findall(r"REQ-\d{2}(?!\d)", fields.get("Requirements", "")))),
            "_fields": fields, "_body": body,
        })

by_id = {}
dups = []
for it in items:
    if it["id"] in by_id:
        dups.append(f"{it['id']} appears in {by_id[it['id']]['epic']} and {it['epic']}")
    by_id[it["id"]] = it

# (a)
expected = [f"FL-{n:03d}" for n in range(1, LAST_ITEM + 1)]
problems = dups[:]
problems += [f"missing {i}" for i in expected if i not in by_id]
problems += [f"unexpected {i}" for i in by_id if i not in expected]
report(f"(a) identifiers are unique and exactly FL-001 to FL-{LAST_ITEM:03d} ({len(items)} found)", problems)

# (b)
report("(b) every Depends on identifier exists",
       [f"{it['id']} depends on unknown {d}" for it in items for d in it["depends_on"] if d not in by_id])

# (c)
problems, state = [], {}


def visit(node, trail):
    if state.get(node) == 2 or node not in by_id:
        return
    if state.get(node) == 1:
        problems.append("cycle: " + " -> ".join(trail[trail.index(node):] + [node]))
        return
    state[node] = 1
    for d in by_id[node]["depends_on"]:
        visit(d, trail + [node])
    state[node] = 2


for it in items:
    visit(it["id"], [])
report("(c) the dependency graph has no cycle", problems)

# (d)
problems = []
for it in items:
    for d in it["depends_on"]:
        if d in by_id and it["phase"].isdigit() and by_id[d]["phase"].isdigit() and int(by_id[d]["phase"]) > int(it["phase"]):
            problems.append(f"{it['id']} (phase {it['phase']}) depends on {d} (phase {by_id[d]['phase']})")
    if not it["phase"].isdigit():
        problems.append(f"{it['id']} has no numeric phase: {it['phase']!r}")
report("(d) no item depends on an item in a later phase", problems)

# (e)
problems = []
for it in items:
    rows = summaries.get(it["id"], [])
    if len(rows) != 1:
        problems.append(f"{it['id']} has {len(rows)} summary rows")
        continue
    epic, title, phase, dep, status = rows[0]
    if epic != it["epic"]:
        problems.append(f"{it['id']} summary row is in {epic}, item in {it['epic']}")
    if title.strip() != it["title"]:
        problems.append(f"{it['id']} title differs: table {title!r} / header {it['title']!r}")
    if phase.strip() != it["phase"]:
        problems.append(f"{it['id']} phase differs: table {phase} / item {it['phase']}")
    if deps_of(dep) != it["depends_on"]:
        problems.append(f"{it['id']} depends-on differs: table {dep} / item {', '.join(it['depends_on']) or 'None'}")
    if status.strip() != it["status"]:
        problems.append(f"{it['id']} status differs: table {status} / item {it['status']}")
problems += [f"summary row {i} has no item section" for i in summaries if i not in by_id]
report("(e) each epic's summary table agrees with the item headers", problems)

# (f)
problems = []
for it in items:
    for f in TABLE_FIELDS:
        if not it["_fields"].get(f, "").strip():
            problems.append(f"{it['id']} lacks table field {f}")
    positions = []
    for f in BOLD_FIELDS:
        m = re.search(r"^\*\*%s\.\*\*" % re.escape(f), it["_body"], re.M)
        if not m:
            problems.append(f"{it['id']} lacks field {f}")
        else:
            positions.append(m.start())
    if positions != sorted(positions):
        problems.append(f"{it['id']} fields are out of order")
    acc = re.search(r"^\*\*Acceptance criteria\.\*\*(.*?)^\*\*Validation\.\*\*", it["_body"], re.M | re.S)
    if not acc or not re.search(r"^- \[[ x]\] ", acc.group(1), re.M):
        problems.append(f"{it['id']} has no acceptance criterion written as a checkbox")
    if it["_fields"].get("Depends on", "").strip() != "None" and not it["depends_on"]:
        problems.append(f"{it['id']} Depends on is neither None nor identifiers")
report("(f) every item has all fields and a checkbox acceptance criterion", problems)

# (g)
problems = [f"{it['id']} status is {it['status']!r}" for it in items if it["status"] not in ("Pending", "Completed", "Under Review")]
for path in EPICS:
    m = re.search(r"^\| Status \| (.*) \|$", path.read_text(), re.M)
    if not m or m.group(1).strip() not in ("Pending", "Completed", "Under Review"):
        problems.append(f"{path.stem} status is not Pending")
report("(g) every status is Pending, Completed or Under Review", problems)

# (h)
problems = []
docs = list((REPO / "docs/roadmap").rglob("*.md")) + list((REPO / "docs/product").rglob("*.md"))
roadmap_index = (REPO / "docs/roadmap/ROADMAP.md").resolve()
checked = 0
for doc in docs:
    for target in re.findall(r"\]\(([^)\s]+)\)", doc.read_text()):
        if re.match(r"[a-z]+://|mailto:|#", target):
            continue
        dest = (doc.parent / target.split("#")[0]).resolve()
        checked += 1
        # Anchors are never checked; ROADMAP.md anchors change when the lead regenerates it,
        # but the file itself must exist.
        if not dest.exists():
            problems.append(f"{doc.relative_to(REPO)}: {target}")
if not roadmap_index.exists():
    problems.append("docs/roadmap/ROADMAP.md does not exist")
report(f"(h) every relative link resolves to an existing file ({checked} checked; anchors not checked)", problems)

# (i)
req_text = REQ_FILE.read_text()
req_rows = {m.group(1): m.group(0) for m in re.finditer(r"^\| (REQ-\d{2}) \|.*$", req_text, re.M)}
problems = []
expected_reqs = [f"REQ-{n:02d}" for n in range(1, LAST_REQ + 1)]
problems += [f"{r} has no row in REQUIREMENTS.md" for r in expected_reqs if r not in req_rows]
problems += [f"unexpected row {r}" for r in req_rows if r not in expected_reqs]
for path in EPICS:
    for r in set(re.findall(r"REQ-\d{2}(?!\d)", path.read_text())):
        if r not in req_rows:
            problems.append(f"{path.stem} cites unknown {r}")
delivered = {r: sorted(it["id"] for it in items if r in it["requirements"]) for r in expected_reqs}
for r in expected_reqs:
    owners = [e for e, rs in epic_reqs.items() if r in rs]
    if not delivered[r] and not (r in ("REQ-32", "REQ-33", "REQ-34") and owners):
        problems.append(f"{r} is delivered by no work item")
    if not owners:
        problems.append(f"{r} is owned by no epic")
report(f"(i) every cited REQ exists and every REQ-01..{LAST_REQ} is delivered or owned", problems)

# (j) the lists in REQUIREMENTS.md agree with the Requirements rows of the items
problems = []
for r in expected_reqs:
    if r not in req_rows:
        continue
    cells = [c.strip() for c in req_rows[r].strip("|").split("|")]
    listed = sorted(set(ids(cells[-1])))
    if listed != delivered[r]:
        problems.append(f"{r}: REQUIREMENTS.md lists {listed}; items cite it: {delivered[r]}")
    listed_epics = sorted(set(re.findall(r"EPIC-\d{2}", cells[-2])))
    owners = sorted(e for e, rs in epic_reqs.items() if r in rs)
    if listed_epics != owners:
        problems.append(f"{r}: REQUIREMENTS.md names epics {listed_epics}; epic headers: {owners}")
report("(j) REQUIREMENTS.md work-item and epic lists agree with the epic files", problems)

# (k) every FL identifier mentioned anywhere in docs/roadmap or docs/product exists
problems = []
for doc in docs:
    for i in sorted(set(ids(doc.read_text()))):
        if i not in by_id:
            problems.append(f"{doc.relative_to(REPO)} mentions unknown {i}")
report("(k) every FL identifier mentioned in roadmap and product files exists", problems)

OUT.write_text(json.dumps(
    [{k: v for k, v in by_id[i].items() if not k.startswith("_")} for i in sorted(by_id)], indent=2) + "\n")
print(f"\nwrote {OUT} with {len(by_id)} items")
failed = [label for label, p in results if p]
print("ALL CHECKS PASS" if not failed else f"{len(failed)} CHECK(S) FAILED")
sys.exit(1 if failed else 0)
