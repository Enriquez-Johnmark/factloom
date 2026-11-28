# EPIC-13: Healthcare proof on invented data

| | |
|---|---|
| Status | Pending |
| Phases | 6 |
| Packages | `packages/adapters` (healthcare domain and FHIR mapping), `@kronomind/core`, `@kronomind/storage`, `@kronomind/graph-rag`, `apps/mcp-server` |
| Requirements | REQ-17, REQ-34 |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md). Where another document disagrees with [`INTERFACES.md`](../../architecture/INTERFACES.md), `INTERFACES.md` wins.

**This epic uses invented data only.** No record from a real person is read, stored, sent or committed, in code, tests, scenarios or the demo. Kronomind is not ready for patient data, and nothing here claims that any deployment meets HIPAA or any other rule. Whether a deployment complies is decided by a qualified professional.

## Outcome

A healthcare **domain adapter** exists for the first time and proves, on invented FHIR R4 records, the four things the healthcare section of [EPIC-12](EPIC-12.md) needs from the core first: an answer for now, for an **as-of date** and for a **known-at date**, a **correction** kept with its **fact history**, and every change to a stored fact held for a clinician's approval. The proof is reached before phase 4, so the needs it finds in the fact model are known before Postgres is designed.

## Scope

- The healthcare rules and standards read in their official texts on 2026-11-28, written into the repository (FL-088).
- An ADR that brings this proof forward from the end of phase 6 and places the code (FL-089).
- The **correction policy** `human_approval` honoured on the structured path: `record_fact`, `invalidate_fact` and the use cases under them store a proposal instead of changing a stored fact (FL-090).
- A healthcare domain as data, and the domain chosen when the server or a command starts (FL-091).
- A FHIR R4 import by fixed rules, with no LLM, for MedicationStatement, Condition and AllergyIntolerance (FL-092).
- An invented-data scenario set for healthcare (FL-093) and a demo command (FL-094).

## Out of scope

- Observation, values with units, negated facts (`refuted`, `not-taken`, `not-done`), the source system's own dates as a field, a qualifier in the conflict key, annotations, and patient merges under approval. They are the second stage of the healthcare plan and need their own work items.
- Per-fact access control, read-access auditing, user identity and encryption. They need users, which arrive with phase 4 ([EPIC-10](EPIC-10.md)).
- Extraction from clinical notes with a real LLM. It needs an agreement with the provider. The scenarios use the scripted LLM client.
- Any connector to a real electronic health record system.

## Boundaries and constraints

- **Only a domain adapter knows its domain** (REQ-31). No healthcare entity type, predicate or FHIR name appears in `core`, `graph-rag` or a storage adapter, outside test data.
- **Invalidate, never delete** ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)). FHIR `entered-in-error` becomes a proposed **retraction**, never a deletion.
- **Changes go through the fact operations**, also when a person approves them ([`PRODUCT.md`](../../product/PRODUCT.md), REQ-24). No MCP tool approves a proposal, as in FL-070.
- **Schema changes are new migrations** ([`data.md`](../../../.claude/rules/data.md)); none already released is edited.
- **No unverified statement about a regulation** is written here. Each one cites [`healthcare-rules.md`](../../research/industries/healthcare-rules.md) or [`other-industries.md`](../../research/industries/other-industries.md).

## Dependencies

| Epic | Why |
|---|---|
| [EPIC-08](EPIC-08.md) | Proposals and the `proposals` command (FL-043, FL-070) |
| [EPIC-04](EPIC-04.md) | The domain shape and the software development domain (FL-018), which the healthcare domain follows |
| [EPIC-07](EPIC-07.md) | The scenario format and runner (FL-027) |
| [EPIC-12](EPIC-12.md) | The healthcare requirements this epic starts to meet. EPIC-12 keeps the rest |

## Deliverables

- [`healthcare-rules.md`](../../research/industries/healthcare-rules.md), and rows Q-59 and Q-63 updated.
- One ADR, and the updated [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md).
- `packages/adapters` with the healthcare domain and the FHIR mapping.
- A migration that lets a proposal hold a retraction.
- An import command, a demo command, and the healthcare scenario files.

## Success criteria

- On the healthcare scenarios in replay, the staleness rate and the false invalidation rate are both 0.
- With correction policy `human_approval`, no fact is ended or invalidated, by any tool or command, before a person approves.
- A search of `core`, `graph-rag` and the storage adapters for the healthcare entity types, predicates and FHIR names finds none outside test data.
- The demo runs on a fresh database file and prints the four answers, every one marked as invented data.

## Open decisions

| Decision | What is known |
|---|---|
| Whether stage 2 of the healthcare plan becomes work items in this epic or a new one | Decided when FL-094 is done, from what the scenarios showed |

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-088 | Healthcare rules read in their official texts | 6 | None | Completed |
| FL-089 | ADR: the healthcare proof comes before phase 4 | 6 | FL-088 | Pending |
| FL-090 | Human approval on the structured path | 6 | FL-070 | Pending |
| FL-091 | Healthcare domain as data, and choosing the domain at start | 6 | FL-089 | Pending |
| FL-092 | FHIR R4 import by fixed rules | 6 | FL-090, FL-091 | Pending |
| FL-093 | Healthcare scenarios on invented data | 6 | FL-092, FL-027 | Pending |
| FL-094 | Healthcare demo command | 6 | FL-093 | Pending |

### FL-088: Healthcare rules read in their official texts

| | |
|---|---|
| Status | Completed |
| Phase | 6 |
| Depends on | None |
| Requirements | REQ-34 |
| Components | `docs/research/` |

**Objective.** Record what the healthcare rules and FHIR R4 say, read in their official texts, so that the healthcare adapter is designed on confirmed findings.

**Background.** EPIC-12 forbids designing a regulated adapter while a row of [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) that it relies on is open. [`other-industries.md`](../../research/industries/other-industries.md) read HIPAA on a mirror, the EU AI Act on an unofficial mirror, and could not read HHS (Q-59, Q-63). On 2026-11-28 the eCFR API, the Federal Register API, GovInfo and the EU Publications Office could be read from a cloud session.

**Outcome.** One research document gives each rule's wording with its URL, access date and label, and the open-questions table says what is now confirmed and what is still not.

**Scope.**
- A new research document, `docs/research/industries/healthcare-rules.md`.
- The rows Q-59 and Q-63 of `OPEN-QUESTIONS.md`, updated in their own commit.

**Non-goals.**
- Legal advice, or any statement that a deployment complies.
- Changing `other-industries.md`. It stays as the record of what was read on 2026-11-13.

**Functional requirements.**
1. Each finding gives the rule, a short quote, the URL read, the access date and a label: confirmed, likely or unverified.
2. It covers HIPAA 45 CFR 164.526, 164.312, 164.308, 164.316, 164.528, 164.501, 164.502, 164.504, 164.514 and 160.103; the Privacy Rule published on 2026-11-19; the status of the proposed Security Rule; ONC 45 CFR 170.315(b)(11); FDA's clinical decision support guidance; the EU AI Act and Regulation (EU) 2026/1744; and the FHIR R4 time and status fields.
3. It says what each finding means for Kronomind, as a design observation only.
4. What could not be read stays unverified and is listed.

**Technical requirements.**
- Markdown in the format of the other research documents, with the access date at the top.

**Constraints.**
- [Engineering principles](../../../.claude/rules/engineering-principles.md), "Accuracy".

**Acceptance criteria.**
- [x] `docs/research/industries/healthcare-rules.md` exists, and every finding in it has a URL, an access date and a label.
- [x] Q-59 and Q-63 in `OPEN-QUESTIONS.md` say which parts were read in official texts on 2026-11-28 and which remain open.
- [x] `pnpm check` passes.

**Validation.** `pnpm check`, which runs the format check over Markdown, and `python3 scripts/roadmap/check.py`.

**Completion evidence.** The commits and the `pnpm check` output.

**Recorded evidence.** Done on 2026-11-28 in a cloud session on Linux x64.

- **The research** (`4e32955`): [`healthcare-rules.md`](../../research/industries/healthcare-rules.md), with 11 HIPAA findings, 9 on rules for AI in healthcare and 9 on FHIR R4, each with its URL, the access date and a label. Three agents read the sources in parallel; the session checked again the Federal Register entries 2026-23429, 2024-30983 and 2026-21943, the removal wording in 2026-21943, the AI Omnibus dates in the Official Journal text, and three FHIR R4 definitions.
- **The open questions** (`c6b5e5f`): Q-59, Q-60 and Q-63 say what the reading answered and what is still open. None is closed: HHS guidance, the GDPR articles, 21 CFR 11.70 and Part 820 were not read.
- **Differs from the item as written:** Q-60 was updated as well, because the Official Journal text of Regulation (EU) 2026/1744 answers its dates.
- **Not run:** nothing in the item needs a run beyond the checks. No source was read on `hhs.gov` or `eur-lex.europa.eu`, which refused the session.
- **`pnpm check`:** 138 test files and 1,444 tests passed; `python3 scripts/roadmap/check.py` printed `ALL CHECKS PASS`.

### FL-089: ADR: the healthcare proof comes before phase 4

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-088 |
| Requirements | REQ-34 |
| Components | `docs/architecture/` |

**Objective.** Record why the healthcare proof is built now, ahead of phase 4 and the other domains, and where its code lives.

**Background.** EPIC-12 delivers healthcare last, because it needs the most from the core. The fact schema with its time fields is where mistakes are expensive ([engineering principles](../../../.claude/rules/engineering-principles.md)). FHIR R4 tests that schema hardest: inclusive end dates, imprecise dates, statuses that mean different things, and the source system's own dates ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md)). Phase 4 designs a second store. Finding these needs before it is cheaper than migrating two stores after.

**Outcome.** An accepted ADR, and documents that agree with it.

**Scope.**
- ADR 0026, giving the decision, its reason and the alternatives rejected: phase 4 first, and the healthcare code inside `graph-rag`.
- The place of the code: `packages/adapters`, the package EPIC-12 names, with the healthcare domain as its first module.
- `SYSTEM-BOUNDARIES.md` updated for the new package: it may import `core` and `graph-rag`, and only the app imports it. The lint rule that enforces this arrives with the package in FL-091.
- The rule of this epic written in the ADR: invented data only until the later stages of the healthcare plan.

**Non-goals.**
- Moving any other domain forward. EPIC-12's order holds for them.

**Functional requirements.**
1. The ADR names the alternatives rejected and why.

**Technical requirements.**
- The ADR follows the format of [ADR 0025](../../architecture/adr/0025-the-project-is-named-kronomind.md) and is listed in [`DECISIONS.md`](../../architecture/DECISIONS.md).

**Constraints.**
- [`architecture.md`](../../../.claude/rules/architecture.md).

**Acceptance criteria.**
- [ ] ADR 0026 is accepted by the owner.
- [x] `SYSTEM-BOUNDARIES.md` lists `packages/adapters` and what it may import.
- [ ] `pnpm check` passes.

**Validation.** `pnpm check`.

**Completion evidence.** The commits, the owner's acceptance, and the `pnpm check` output.

### FL-090: Human approval on the structured path

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-070 |
| Requirements | REQ-17 |
| Components | `@kronomind/graph-rag`, `@kronomind/storage`, `apps/mcp-server` |

**Objective.** Under the correction policy `human_approval`, make every change to a stored fact wait for a person, also when it comes from `record_fact`, `invalidate_fact` or an import.

**Background.** FL-070 holds the successions and corrections that `remember` finds as proposals (`packages/graph-rag/src/remember.ts`). The structured path does not read the correction policy: `change-fact.ts` and `record-structured-facts.ts` end or invalidate a stored fact at once. A FHIR import records structured facts, so under `human_approval` it would change patient facts with no approval. A proposal holds a `succession` or a `correction` ([`SCHEMA.md`](../../architecture/SCHEMA.md), `proposed_change`); FHIR `entered-in-error` needs a **retraction**, which no proposal can hold today.

**Outcome.** In a `human_approval` domain, no tool, use case or command ends or invalidates a fact until a person approves with the `proposals` command.

**Scope.**
- The structured use cases read the domain's correction policy and, under `human_approval`, store a proposal for each succession, correction or retraction instead of committing it.
- A migration that adds the kind `retraction` to `proposed_change`, in both the schema and the approval code.
- The `record_fact` and `invalidate_fact` tools report a stored proposal with its identifier, as `remember` does.

**Non-goals.**
- "A human decision is not overridden by a later automatic one". [EPIC-11](EPIC-11.md) owns it.
- Approval of a new fact that changes no stored fact. It is recorded at once, as under FL-070.

**Functional requirements.**
1. Under `human_approval`, a call that would end, correct or retract a stored fact stores one proposal and changes no fact.
2. Approving a retraction proposal invalidates the fact with nothing to replace it, with the trigger `person`.
3. Under `automatic`, behaviour is unchanged; every existing test passes without being edited.
4. `proposals list` shows retraction proposals with the kind `retraction`.

**Technical requirements.**
- The migration is a new numbered file; no released migration is edited.
- The signatures follow [`INTERFACES.md`](../../architecture/INTERFACES.md), which is updated in its own commit if a signature changes.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md), [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md), [`data.md`](../../../.claude/rules/data.md).

**Acceptance criteria.**
- [ ] A test shows that under `human_approval`, `invalidate_fact` with a replacement stores a correction proposal, and the stored fact stays live until it is approved.
- [ ] A test shows that under `human_approval`, `invalidate_fact` with no replacement stores a retraction proposal, and approval invalidates the fact.
- [ ] A test shows that under `human_approval`, a structured succession is a proposal, and rejection changes no fact.
- [ ] The storage contract suite passes against both stores after the migration.
- [ ] `pnpm check` passes.

**Validation.** Unit tests of the use cases, the storage contract suite, and the tool tests in `apps/mcp-server`.

**Completion evidence.** The commits and the `pnpm check` output.

### FL-091: Healthcare domain as data, and choosing the domain at start

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-089 |
| Requirements | REQ-34 |
| Components | `packages/adapters`, `apps/mcp-server` |

**Objective.** Define the healthcare domain as data and let the server and its commands run under it.

**Background.** A domain is data: entity types, predicates with their cardinality, extraction instructions and a correction policy (`packages/core/src/domain.ts`). The server always uses the software development domain (`apps/mcp-server/src/main.ts`). EPIC-12 lists the healthcare entity types and predicates.

**Outcome.** A user can start the server or a command with the healthcare domain, and every change to a stored fact is then held for approval.

**Scope.**
- `packages/adapters` created as ADR 0026 decides, with the healthcare domain: entity types Patient, Condition, Medication, Procedure, Encounter, Practitioner, Organization and Allergy, and the predicates `has_condition`, `takes`, `prescribed_by`, `allergic_to` and `contraindicates`, each with its cardinality and description.
- Correction policy `human_approval`.
- A configuration value that selects the domain, named and documented in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Shape of the server", with software development as its default.

**Non-goals.**
- Observation and `observed`, which need values with units. `same_as`, which merges under approval cover.
- Extraction instructions tuned for clinical notes. A short placeholder is enough, because no real LLM is called in this epic.

**Functional requirements.**
1. With no setting, the server behaves exactly as before.
2. An unknown domain name stops the server with a message naming the known ones.
3. The healthcare domain passes `DomainSchema`.

**Technical requirements.**
- No healthcare name in `core`, `graph-rag` or storage.

**Constraints.**
- REQ-31, [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md).

**Acceptance criteria.**
- [ ] A test parses the healthcare domain with `DomainSchema`.
- [ ] A test starts the server's dependencies with the healthcare domain and finds the policy `human_approval`.
- [ ] A test shows that an unknown domain name is refused with the list of known ones.
- [ ] A search of `packages/core`, `packages/graph-rag` and `packages/storage` for the healthcare entity types and predicates finds none outside test data.
- [ ] A lint rule for `packages/adapters` enforces its row in `SYSTEM-BOUNDARIES.md`: an import of `@kronomind/storage` from it, and an import of it from `graph-rag`, each make `pnpm check` fail, and are removed.
- [ ] `pnpm check` passes.

**Validation.** Unit tests, `pnpm check`, and the two forbidden imports added by hand and removed.

**Completion evidence.** The commits, the search output, the failing then passing check output, and the `pnpm check` output.

### FL-092: FHIR R4 import by fixed rules

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-090, FL-091 |
| Requirements | REQ-34 |
| Components | `packages/adapters`, `apps/mcp-server` |

**Objective.** Turn FHIR R4 MedicationStatement, Condition and AllergyIntolerance resources into facts by fixed rules, with no LLM, so that structured records never reach a model.

**Background.** FHIR separates when a thing was true from when it was recorded, and separates "stopped" from "entered in error" ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md)). Four traps were confirmed on hl7.org on 2026-11-28: a Period's end is inclusive while **valid time** ends exclusively; `recordedDate` and `dateAsserted` are the source system's times, not Kronomind's **recorded time**; `refuted` is a clinical judgement, not an error; and an onset can be a year, an age, a range or text.

**Outcome.** A command reads a file of FHIR resources and records facts and proposals from it, and reports every element it did not map.

**Scope.**
- A mapping in `packages/adapters` from the three resource types to fact inputs, sources and changes:

  | FHIR R4 | Kronomind |
  |---|---|
  | `effective[x]`, `onset[x]` | `valid_from` |
  | `effective.end`, `abatement[x]` | `valid_to`, the day after the inclusive end |
  | `stopped`, `completed`, `resolved`, `inactive`, `remission` | Succession |
  | `entered-in-error` | Retraction, proposed |
  | `refuted`, `not-taken`, `intended`, `on-hold`, `unknown` | Not mapped; reported |
  | `informationSource`, `derivedFrom`, `meta.source` | Source |
  | `recordedDate`, `dateAsserted` | Kept in the source's content, not in `created_at` |

- An imprecise date is stored as the earliest moment it allows, and the original text is kept in the source's content. An age, a range or a text onset is not mapped and is reported.
- A command in `apps/mcp-server` that reads a FHIR Bundle or a list of resources from a file and records them through the structured use cases.

**Non-goals.**
- Observation, Procedure, Encounter and MedicationRequest.
- HL7 v2, FHIR R4B, R5 or R6, and any server connection.
- A new column for the source system's dates. Stage 2 of the healthcare plan decides it.

**Functional requirements.**
1. No LLM client is called; a test runs the import with a client that fails if called.
2. Importing the same file twice records no second fact: the second run is a **restatement**.
3. A resource that changes a stored fact under `human_approval` produces a proposal, through FL-090.
4. The report lists, per resource, the facts recorded, the proposals stored and each element not mapped, with the reason.
5. An invalid resource is refused with its path in the file and changes nothing.

**Technical requirements.**
- Input is parsed with Zod schemas covering only the elements used. No FHIR library is added.
- The end-date conversion and the imprecise-date rule each have their own tests at the boundary day.

**Constraints.**
- REQ-31; the boundaries of this epic.

**Acceptance criteria.**
- [ ] A test imports a MedicationStatement with `effective.end` 2026-06-30, and recall with as-of date 2026-06-30 returns it while 2026-07-01 does not.
- [ ] A test imports a Condition with onset `2026`, stores `valid_from` 2026-01-01, and keeps `2026` in the source's content.
- [ ] A test imports an AllergyIntolerance, then the same resource as `entered-in-error`, and finds a retraction proposal and the fact still live.
- [ ] A test imports a Condition with `refuted` and finds it reported as not mapped, with no fact recorded.
- [ ] A test with an LLM client that fails if called passes.
- [ ] `pnpm check` passes.

**Validation.** Unit tests of the mapping, a command test, and `pnpm check`.

**Completion evidence.** The commits and the `pnpm check` output.

### FL-093: Healthcare scenarios on invented data

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-092, FL-027 |
| Requirements | REQ-34 |
| Components | `apps/mcp-server/evals` |

**Objective.** Prove the healthcare behaviour with scenarios in the existing format, as the first domain's scenarios prove it for code.

**Background.** A scenario is a list of dated inputs and then expectations about memory ([`TESTING.md`](../../architecture/TESTING.md), "Layer B"). Its schema is `apps/mcp-server/evals/scenario.ts`. The healthcare cases come from the plan's invented scenarios.

**Outcome.** A healthcare scenario set that runs in replay on every check.

**Scope.**
- At least seven scenarios, each on invented records marked `INVENTED DATA`: a medication stopped; the last day of a period; an allergy entered in error and approved; two sources that disagree; a correction rejected; a condition resolved; a condition refuted.
- A step kind for a FHIR import, if the format has none, added to the schema with its test.
- Proposal decisions as steps, so that a scenario can approve or reject.

**Non-goals.**
- Recordings of a real LLM. Notes, where a scenario has any, use the scripted LLM client.

**Functional requirements.**
1. Every scenario states its expectations for now, for an as-of date and for a known-at date.
2. The staleness rate and the false invalidation rate are computed as in [`TESTING.md`](../../architecture/TESTING.md).

**Technical requirements.**
- No name, date of birth, identifier or code from a real person. Patients are named `Invented Patient A` and so on.

**Constraints.**
- The boundaries of this epic.

**Acceptance criteria.**
- [ ] The seven scenarios exist and validate against the schema.
- [ ] In replay, the staleness rate and the false invalidation rate are both 0.
- [ ] `pnpm check` passes.

**Validation.** The scenario runner in replay, run by `pnpm check`.

**Completion evidence.** The commits, the scenario metrics and the `pnpm check` output.

### FL-094: Healthcare demo command

| | |
|---|---|
| Status | Pending |
| Phase | 6 |
| Depends on | FL-093 |
| Requirements | REQ-34 |
| Components | `apps/mcp-server` |

**Objective.** Show a person, in one command, what the healthcare proof does.

**Background.** The plan's demo answers four questions on invented data: what is true now, what was true on 2026-03-15, what memory believed on 2026-04-01, and what waits for a clinician.

**Outcome.** A command that loads the invented records into a new database file and prints the four answers and the approval step.

**Scope.**
- A `demo healthcare` command in `apps/mcp-server` that creates a database file in a temporary directory, imports the invented records of FL-093, prints each answer with its facts, sources and dates, approves one proposal, and prints the fact history.
- A short section in the app's README.

**Non-goals.**
- A web page or a recording. The command's output is the demo.

**Functional requirements.**
1. The first and last lines of the output say `INVENTED DATA`.
2. It never reads or writes the user's own database.
3. It makes no network call.

**Technical requirements.**
- It reuses the import command of FL-092 and the use cases; it adds no second path to memory.

**Constraints.**
- The boundaries of this epic.

**Acceptance criteria.**
- [ ] A test runs the command and finds the four answers and the `INVENTED DATA` lines.
- [ ] A test shows the user's configured database file is untouched.
- [ ] `pnpm check` passes.

**Validation.** A command test and `pnpm check`.

**Completion evidence.** The commits, a copy of the output, and the `pnpm check` output.
