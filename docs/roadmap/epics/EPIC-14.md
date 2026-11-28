# EPIC-14: Clinical facts on invented data

| | |
|---|---|
| Status | Pending |
| Phases | 6 |
| Packages | `packages/adapters`, `@kronomind/core`, `@kronomind/storage`, `@kronomind/graph-rag`, `apps/mcp-server` |
| Requirements | REQ-34 |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md). Where another document disagrees with [`INTERFACES.md`](../../architecture/INTERFACES.md), `INTERFACES.md` wins.

**This epic uses invented data only**, under the rule of [ADR 0026](../../architecture/adr/0026-healthcare-proof-before-phase-4.md). Kronomind is not ready for patient data, and nothing here claims that any deployment meets HIPAA or any other rule.

## Outcome

The second stage of the healthcare plan. The proof of [EPIC-13](EPIC-13.md) found what clinical records need from the fact model that the first domain did not: a fact that something was ruled out or not taken, and a measured value with its unit. With this epic, the FHIR import maps `refuted` and `not-taken`, and imports Observation, which it reported as not mapped before.

## Scope

- How a negated clinical fact is recorded, decided in an ADR (FL-096), and built in the healthcare domain and the import (FL-097).
- How a measured value is a fact, decided in an ADR (FL-098), its unit in the fact model (FL-099), and the Observation import (FL-100).

## Out of scope

- The other needs of the healthcare plan's second stage, each written as a work item only when a scenario needs it (see "Open decisions").
- Per-fact access control, read-access auditing and user identity: phase 4 ([EPIC-10](EPIC-10.md)).
- Arithmetic on values, such as a trend or a threshold, and unit conversion.

## Boundaries and constraints

- **Only a domain adapter knows its domain** (REQ-31). No healthcare name enters `core`, `graph-rag` or a storage adapter.
- **The first schema is not rewritten.** A change to the fact model is a nullable column in a new migration, in both stores, with the storage contract suite extended ([`data.md`](../../../.claude/rules/data.md)).
- **Invalidate, never delete** ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)), and every change to a stored fact under `human_approval` is a proposal (FL-090, FL-095).
- **Each design decision gets its ADR before its code**, accepted by the owner.

## Dependencies

| Epic | Why |
|---|---|
| [EPIC-13](EPIC-13.md) | The healthcare domain, the FHIR import, the healthcare scenarios and the demo |
| [EPIC-03](EPIC-03.md) | The SQLite store, its migrations and the storage contract suite |

## Deliverables

- ADR 0027 and ADR 0028.
- The healthcare domain with negated facts and measured values.
- A migration that adds the unit, in both stores.
- The import of `refuted`, `not-taken` and Observation, with healthcare scenarios for each.

## Success criteria

- On the healthcare scenarios in replay, the staleness rate and the false invalidation rate stay 0, with the new scenarios included.
- A search of `core`, `graph-rag` and the storage adapters for the new healthcare names finds none outside test data.
- The storage contract suite passes against both stores after the migration.

## Open decisions

| Decision | What is known |
|---|---|
| A conflict per prescriber or per source | EPIC-12 lists a qualifier in the conflict key for healthcare; ADR 0010 rejected one until a domain proves the need. No scenario needs it yet |
| Annotations on facts, for a statement of disagreement | HIPAA 164.526(d)(4) links a statement of disagreement and a rebuttal to the record ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), H1) |
| Patient merges under approval | The reversible merge of phase 3 exists; under `human_approval` the duplicate job only reports |
| The end of an allergy | R4 AllergyIntolerance has no end element; a resolved allergy is reported as not mapped (FL-092) |
| The source system's own dates as a field | `recordedDate` and `dateAsserted` are kept in the source's content (FL-092); no question needs them as a field yet |

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-096 | ADR: a negated clinical fact is a specific predicate | 6 | FL-094 | Completed |
| FL-097 | Negated facts in the healthcare domain and the FHIR import | 6 | FL-096 | Pending |
| FL-098 | ADR: how a measured value is a fact | 6 | FL-094 | Completed |
| FL-099 | A unit beside a fact's value | 6 | FL-098 | Pending |
| FL-100 | Observation import | 6 | FL-099, FL-097 | Pending |

### FL-096: ADR: a negated clinical fact is a specific predicate

| | |
|---|---|
| Status | Completed |
| Phase | 6 |
| Depends on | FL-094 |
| Requirements | REQ-34 |
| Components | `docs/architecture/` |

**Objective.** Decide how Kronomind records that a condition was ruled out or a medication was not taken.

**Background.** FHIR R4 `refuted` is "ruled out by diagnostic and clinical evidence" and `not-taken` says a medication was not taken ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), F6, F7). Both are clinical statements, not record errors, so neither is an invalidation. The import reports them as not mapped (FL-092). Facts have no negation today. [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) keys conflicts by subject and specific predicate.

**Outcome.** An accepted ADR that FL-097 builds.

**Scope.**
- ADR 0027, with the decision, the reason and the alternatives rejected, listed in `DECISIONS.md`.

**Non-goals.**
- The code: FL-097.

**Functional requirements.**
1. The ADR says how a ruled-out condition and a medication not taken are recorded, and what happens when one arrives for a fact that is live.

**Technical requirements.**
- The format of the other ADRs.

**Constraints.**
- [Engineering principles](../../../.claude/rules/engineering-principles.md): depth in the fact schema.

**Acceptance criteria.**
- [x] ADR 0027 is accepted by the owner.
- [x] `pnpm check` passes.

**Validation.** `pnpm check`.

**Completion evidence.** The commit and the owner's acceptance.

**Recorded evidence.** Prepared on 2026-11-28 in a cloud session. ADR 0027 is written with status proposed and listed in `DECISIONS.md`. The owner accepted it in the session on 2026-11-28 (`8d9acb8`). `pnpm check` passed.

### FL-097: Negated facts in the healthcare domain and the FHIR import

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-096 |
| Requirements | REQ-34 |
| Components | `packages/adapters`, `apps/mcp-server/evals` |

**Objective.** Import `refuted` and `not-taken` as ADR 0027 decides.

**Background.** ADR 0027. The mapping and the reconciliation of FL-092.

**Outcome.** A ruled-out condition and a medication not taken are facts in memory, and one that contradicts a live fact is a proposal for a clinician.

**Scope.**
- The predicates ADR 0027 names, in the healthcare domain.
- The mapping of `refuted` (Condition, AllergyIntolerance) and `not-taken` (MedicationStatement).
- Reconciliation when a live fact says the opposite: a correction proposal under `human_approval`.
- Healthcare scenarios for each.

**Non-goals.**
- Negation in any other domain.

**Functional requirements.**
1. A refuted condition with no live fact records the negated fact.
2. A refuted condition over a live fact of that condition is a correction proposal, whose replacement is the negated fact.
3. A medication `not-taken` with no live fact records the negated fact.

**Technical requirements.**
- No healthcare name in `core`, `graph-rag` or storage.

**Constraints.**
- REQ-31, the boundaries of this epic.

**Acceptance criteria.**
- [ ] A test imports a refuted Condition and finds the negated fact.
- [ ] A test imports a provisional Condition, then the same resource refuted, and finds a correction proposal with the negated fact as replacement.
- [ ] A test imports a MedicationStatement `not-taken` and finds the negated fact.
- [ ] The healthcare scenarios include a ruled-out condition over a provisional one, and pass in replay with both rates at 0.
- [ ] `pnpm check` passes.

**Validation.** Unit tests, the healthcare scenarios, `pnpm check`.

**Completion evidence.** The commits, the scenario metrics and the `pnpm check` output.

### FL-098: ADR: how a measured value is a fact

| | |
|---|---|
| Status | Completed |
| Phase | 6 |
| Depends on | FL-094 |
| Requirements | REQ-34 |
| Components | `docs/architecture/` |

**Objective.** Decide how a measured value, such as a lab result, is recorded: its subject, its predicate, its valid time, and where its unit goes.

**Background.** R4 Observation carries `effective[x]`, the "physiologically relevant time", and `value[x]` as a Quantity with value, unit, system and code, where a UCUM code "SHOULD" be used ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), F7; R4 `observation.html`, `datatypes.html`). A fact's value is text, with no unit ([`SCHEMA.md`](../../architecture/SCHEMA.md)). Results of one test arrive over time for one patient, so which test a value belongs to must be part of the fact. EPIC-12 lists "values with units" and "a qualifier in the conflict key" for healthcare.

**Outcome.** An accepted ADR that FL-099 and FL-100 build.

**Scope.**
- ADR 0028, listed in `DECISIONS.md`.

**Non-goals.**
- The code: FL-099 and FL-100.

**Functional requirements.**
1. The ADR says what the subject, predicate, object, unit and valid time of a measured value are, how a corrected result relates to the earlier one, and what the Postgres store will do.

**Technical requirements.**
- The format of the other ADRs.

**Constraints.**
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md), [`data.md`](../../../.claude/rules/data.md).

**Acceptance criteria.**
- [x] ADR 0028 is accepted by the owner.
- [x] `pnpm check` passes.

**Validation.** `pnpm check`.

**Completion evidence.** The commit and the owner's acceptance.

**Recorded evidence.** Prepared on 2026-11-28 in a cloud session. ADR 0028 is written with status proposed and listed in `DECISIONS.md`. The owner accepted it in the session on 2026-11-28 (`8d9acb8`). `pnpm check` passed.

### FL-099: A unit beside a fact's value

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-098 |
| Requirements | REQ-34 |
| Components | `@kronomind/core`, `@kronomind/storage`, `@kronomind/graph-rag` |

**Objective.** Let a fact whose object is a value carry a unit, as ADR 0028 decides.

**Background.** ADR 0028. Fact rows change only by invalidation and purge, enforced by triggers that name every column ([`SCHEMA.md`](../../architecture/SCHEMA.md)); a new column must be added to them.

**Outcome.** A value fact can be recorded and read with its unit in both stores, and two facts conflict only when their value or unit differs.

**Scope.**
- The unit in `FactObject`, `FactDraft`, `StructuredFactInput` and `INTERFACES.md`.
- A migration that adds the nullable column and replaces the triggers that protect fact rows.
- Both stores, the contract suite, and the comparisons that decide a restatement and a conflict.

**Non-goals.**
- The `record_fact` tool's input: a unit is given only by an import until a tool needs it.
- Unit conversion.

**Functional requirements.**
1. A fact recorded with a unit is read back with it, from every read.
2. A fact with no unit behaves as before.
3. The same value with a different unit is a different object.
4. Purge clears the unit with the value, as ADR 0028 decides.

**Technical requirements.**
- A new numbered migration; no released one is edited.

**Constraints.**
- [`data.md`](../../../.claude/rules/data.md), [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md).

**Acceptance criteria.**
- [ ] A contract test records and reads a value fact with a unit, in both stores.
- [ ] A contract test shows that an update of the unit is refused.
- [ ] A test shows that the same value in a different unit is not a restatement.
- [ ] `pnpm check` passes.

**Validation.** The storage contract suite, unit tests, `pnpm check`.

**Completion evidence.** The commits and the `pnpm check` output.

### FL-100: Observation import

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-099, FL-097 |
| Requirements | REQ-34 |
| Components | `packages/adapters`, `apps/mcp-server/evals` |

**Objective.** Import R4 Observation resources with a Quantity value as ADR 0028 decides.

**Background.** ADR 0028. R4 Observation status: `final`, `amended`, `corrected`, `cancelled`, `entered-in-error`, `preliminary`, `registered`, `unknown`; `amended` "includes updates/new information and corrections" ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), F7).

**Outcome.** A lab result is a fact with its value, unit and time, and a corrected result is a proposal for a clinician.

**Scope.**
- The mapping of Observation with `valueQuantity`, and the statuses above.
- Reconciliation of a later version of the same Observation.
- Healthcare scenarios for a result recorded, a result corrected, and a result entered in error.

**Non-goals.**
- Values other than a Quantity, and components of a panel.

**Functional requirements.**
1. A `final` Observation with a Quantity records the measured value with its unit and its effective time.
2. A `corrected` version of the same Observation is a correction proposal.
3. `entered-in-error` is a retraction proposal.
4. `preliminary`, `registered`, `cancelled`, `unknown` and `amended` are reported as not mapped, with the reason.

**Technical requirements.**
- The schemas cover only the elements read, as in FL-092.

**Constraints.**
- REQ-31, the boundaries of this epic.

**Acceptance criteria.**
- [ ] A test imports a final Observation and finds the value, the unit and the valid time.
- [ ] A test imports a corrected version and finds a correction proposal.
- [ ] The healthcare scenarios include a corrected result, and pass in replay with both rates at 0.
- [ ] `pnpm check` passes.

**Validation.** Unit tests, the healthcare scenarios, `pnpm check`.

**Completion evidence.** The commits, the scenario metrics and the `pnpm check` output.
