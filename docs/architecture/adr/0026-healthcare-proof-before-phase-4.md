# The healthcare proof comes before phase 4, on invented data, in packages/adapters

Status: accepted, by the owner on 2026-11-28.

A first healthcare **domain adapter** is built in phase 6 now, before phase 4 and before the other domains of [EPIC-12](../../roadmap/epics/EPIC-12.md). It is a proof on invented FHIR R4 records only ([EPIC-13](../../roadmap/epics/EPIC-13.md)). Its code lives in a new package, `packages/adapters`, which the composition root alone imports. EPIC-12's order holds for every other domain.

## Why

- **The fact schema is where mistakes are expensive.** The [engineering principles](../../../.claude/rules/engineering-principles.md) put depth in the fact schema with its time fields and in the storage interface. Healthcare tests both hardest: EPIC-12 finds it needs the most from the core.
- **FHIR R4 shows needs the first domain did not.** Read on hl7.org on 2026-11-28 ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), F1 to F9): a Period's end is inclusive while valid time ends exclusively; an onset can be a year, an age, a range or text; `recordedDate` is the source system's time, not Kronomind's recorded time; `refuted` is a clinical judgement that needs a negated fact; and `entered-in-error` needs a proposal that can hold a retraction.
- **Phase 4 designs a second store.** Postgres would copy today's schema. Finding these needs first means one store changes, by migration; finding them after means two.
- **The structured path ignores approval today.** `record_fact` and `invalidate_fact` change a stored fact at once, even under `human_approval`. A FHIR import uses that path, so the gap matters before any healthcare data is mapped.

## The rule of the proof

Invented data only. No record from a real person is read, stored, sent or committed, until a later stage of the healthcare plan has user identity, per-fact access control, read-access auditing, agreements with every subprocessor and a professional assessment ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), "What it means for Kronomind"). Nothing in this proof claims that any deployment meets HIPAA or any other rule.

## Where the code lives

`packages/adapters`, the package EPIC-12 names, with one module per domain and healthcare as the first. It may import `@kronomind/core`, `@kronomind/graph-rag` and `zod`. It must not import `@kronomind/storage`, `@kronomind/maintenance`, or any database, LLM, embedding or MCP library. Only `apps/mcp-server` imports it. The rules are in [`SYSTEM-BOUNDARIES.md`](../SYSTEM-BOUNDARIES.md); the lint rule that enforces them is added with the package, in FL-091.

The software development domain stays in `graph-rag`, where FL-018 put it. Moving it is not needed for this proof, and is decided when a second adapter is built.

## Alternatives rejected

- **Phase 4 first, as the roadmap stood.** The Postgres schema would be designed without the needs above and changed again by migration in both stores.
- **The healthcare code inside `graph-rag`, beside the software development domain.** It would put healthcare names in a package that REQ-31 keeps generic.
- **One package per domain, such as `packages/adapter-healthcare`.** It adds a package, a lint block and a manifest per domain before a second domain exists. One package with a module per domain is enough until two adapters show a reason to split.
- **A first stage with realistic or de-identified data.** De-identification has its own rules (45 CFR 164.514), and a mistake would put a real person's data in a public repository. Invented data cannot.

## Consequences

- EPIC-13 holds the proof's seven work items. The second stage of the healthcare plan (values with units, negated facts, the source system's dates, a qualifier in the conflict key, annotations and patient merges under approval) is written after the proof, from what its scenarios show.
- [`SYSTEM-BOUNDARIES.md`](../SYSTEM-BOUNDARIES.md) gains a row for `packages/adapters`.
- The phase 6 row of the roadmap index lists work items before phases 4 and 5 have any.
