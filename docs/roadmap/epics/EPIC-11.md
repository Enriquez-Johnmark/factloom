# EPIC-11: Document management

| | |
|---|---|
| Status | Pending |
| Phases | 5 |
| Packages | `packages/adapters` (a document domain adapter), a Python worker (new, location not decided), `apps/api`, `packages/core`, both storage adapters |
| Requirements | REQ-33 |

Nothing in this epic is implemented, and it has no work items yet. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Factloom serves its second **domain**: knowledge held in documents that are revised over time. A document, at a specific version, is the **source** of the facts taken from it, so "what did this document say on a date" is an ordinary as-of question. Changes to memory in this domain are proposed and take effect only when a person approves them. One deployment can serve several client organisations without one reading another's memory.

## Scope

- **A document domain adapter.** A second `Domain` in `packages/adapters`: entity types, predicates with their cardinality, extraction instructions, and the **correction policy** `human_approval`. The [research](../../research/industries/other-industries.md), section 5, lists candidate entity types (Document, Decision, Team, Person, Project, System, Topic, Meeting) and relations; the adapter starts with the few its own eval scenarios use, as the first domain did.
- **Document versions as sources.** Each version of a document is recorded as a source with its locator, version and content hash, which the `source` table already holds ([`SCHEMA.md`](../../architecture/SCHEMA.md)). A fact points to the version it was taken from. Where a document states its own effective date, that date gives the fact's `valid_from`, not the date of upload.
- **A small Python worker for PDF files and scans.** It turns a PDF file, or a scanned page through OCR, into text, and hands the text to Factloom to be remembered with the document version as its source. It holds no rules about facts and does not write to the database.
- **The human approval flow.** Built on the proposals of FL-043 in [EPIC-08](EPIC-08.md): the input of an operation, stored as a proposal instead of being applied, with operations to approve and reject it, and a command to list, approve and reject (FL-070). This epic adds what a person needs to use them without a command line: routes to list pending proposals with the facts and sources involved, to approve, and to reject, and a record of who decided.
- **A human decision that a later automatic one does not override.** FL-043 leaves this rule out. It is the second half of REQ-CA-16, which the [competitive analysis](../../research/evaluations/competitive-analysis.md) defers until an adapter requires human approval. The document domain is that adapter, so the rule is built here.
- **Keeping organisations' memory apart (multi-tenancy), built on namespaces.** Several client organisations on one deployment. Each organisation's memory lives in its own **namespace** or namespaces; a caller is authenticated and can reach only the namespaces of its organisation. Multi-tenancy is a property of the deployment, and the partition underneath is the namespace ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- **Eval scenarios for the document domain**, in the format of [`TESTING.md`](../../architecture/TESTING.md): a document revised, a value changed by an amendment with an effective date, a proposal approved, a proposal rejected.

## Out of scope

- Domain adapters for legal, compliance and regulation, healthcare, customer support and CRM, finance and research, and manufacturing and operations: [EPIC-12](EPIC-12.md). Enterprise knowledge management is the closest of those to this epic; how the two relate is an open decision below.
- Per-fact access control inside one organisation, read-access auditing, legal hold, retention schedules and signatures on approvals: [EPIC-12](EPIC-12.md), unless an open decision below moves one of them here.
- The Postgres adapter and the HTTP API themselves: [EPIC-10](EPIC-10.md).
- A user interface. This epic delivers the routes an interface would call.
- A document management system. Factloom keeps knowledge taken from documents and points at their versions; it does not replace the system that holds the files ([`PRODUCT.md`](../../product/PRODUCT.md), "What it is not").
- Transcription of audio. The research places it with this worker; it is taken up with personal business memory in [EPIC-12](EPIC-12.md).

## Boundaries and constraints

- **Only the adapter knows the domain** (REQ-31, [EPIC-10](EPIC-10.md)). No document-specific name appears in `core`, `graph-rag` or a storage adapter.
- **The worker is outside the write path.** It produces text and calls a use case through the HTTP API. It never opens the database, so "writes go through one door" still holds ([architecture rules](../../../.claude/rules/architecture.md), [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
- **An approved proposal is committed through the same fact operations** as any other change, with one audit entry per change. Approval is not a second way to write.
- **A human decision is not overridden by a later automatic one.** This is not part of FL-043, which stays minimal. It is in this epic's scope.
- **Nothing is read or linked across namespaces** ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)). Multi-tenancy adds authentication and a mapping from caller to namespaces in the API layer; it does not weaken the partition.
- **Purge must reach a whole document version.** A document can contain personal data, so the purge of FL-061 must work for a source that many facts depend on ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)).
- **The first schema is not rewritten.** Everything this epic adds to the schema is an added table or a nullable column, through new numbered migrations in both adapters. The [research](../../research/industries/other-industries.md), section (b), lists the additions it expects and why each can be added late.
- **Python is a new language in the repository.** It is confined to the worker, with its own pinned dependencies and its own check, and nothing in the TypeScript packages imports from it.
- **No OCR or PDF library has been researched.** Any library, version or command is checked against current documentation before a work item names it ([engineering principles](../../../.claude/rules/engineering-principles.md)).

## Dependencies

| Epic | Why |
|---|---|
| [EPIC-10](EPIC-10.md) | The domain adapter package, the HTTP API that the worker and the approval routes use, and Postgres for a deployment that serves several organisations |
| [EPIC-08](EPIC-08.md) | Proposals with approve and reject (FL-043, FL-070), the conflict judge (FL-041), and purge (FL-047, FL-061, FL-072) |
| [EPIC-09](EPIC-09.md) | Verification of facts against a source that has a newer version (FL-049, FL-050, FL-062, FL-051) |
| [EPIC-07](EPIC-07.md) | The scenario format and runner (FL-027, FL-039) that the document scenarios reuse |
| [EPIC-04](EPIC-04.md) | The `remember` use case that the worker's text goes through |

## Deliverables

- A document domain adapter in `packages/adapters`.
- Migrations, in both storage adapters, for whatever the open decisions below add to the schema.
- A Python worker with its own check, and a documented way to run it.
- API routes for proposals: list pending, approve, reject.
- Authentication for the API and the mapping from caller to namespaces.
- Document-domain eval scenarios.
- ADRs for the decisions below.

## Success criteria

- A scenario records version 1 of a document, then version 2 in which one value changes. After the proposal is approved, a question with an as-of date before the change returns the old value with version 1 as its source, and a question for now returns the new value with version 2 as its source.
- Until the proposal is approved, the question for now still returns the old value. After a rejection it still does, and the rejection is on record.
- A test starts the worker on a fixture PDF file and on a fixture scanned page, and the facts recorded from each have the document version as their source, with its content hash.
- A test with two organisations on one deployment shows that, on every route, a caller of one who asks about the other's facts, entities, sources or proposals gets the same answer as for something that does not exist.
- A search of `core`, `graph-rag` and the storage adapters for the document domain's entity types and predicate names finds none outside test data.
- The storage contract suite still passes against all stores after the new migrations.
- `pnpm check` still runs everything in the TypeScript workspace with one command, and the worker's check runs in CI.

## Work items

None yet. Work items for this epic are written when phase 5 is near, after the decisions below are made. They follow the template in the [roadmap guide](../README.md) and take the next unused `FL` identifiers.

## Open decisions

Each must be decided, and recorded in an ADR where it is a design decision, before work items can be written.

| Decision | What is known |
|---|---|
| Whether the document domain of this epic is the enterprise knowledge management adapter of [EPIC-12](EPIC-12.md), or a smaller base that it extends | The research treats enterprise knowledge management as "adapter plus per-fact access control", on top of document versions as sources. This epic covers the second part and not the first |
| The entity types and predicates of the document domain | Candidates are in the [research](../../research/industries/other-industries.md), section 5. Start with what the scenarios use |
| How text derived from another artefact is recorded: OCR text of a scan, text of a PDF file | The research proposes a `derived_from` link on a source. An independent review judged it deferrable to a nullable column ([`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), section C). The `source` table has no such column today |
| Whether sources get line or page spans and span hashes | Listed in [`DECISIONS.md`](../../architecture/DECISIONS.md) as left out until file sources are recorded |
| How a long document is split before it is remembered, and how the parts share one source | Not designed. The phase 1 `remember` tool accepts up to 20,000 characters of text ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md)) |
| How a document's effective date reaches `valid_from` | The research says the document's own effective date must drive it. Whether the worker, the extraction instructions or the caller supplies it is not decided |
| Whether date values need a type | A fact's literal object is text today. The research wants date literals so that a job can find overdue reviews, and says a `value_type` beside the value would do it |
| Whether a qualifier is added to the conflict key | [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) rejected it until a domain proves the need |
| How the worker hands text to Factloom: a call to the HTTP API, a queue, or files in a directory | Not designed. The constraint is that it does not open the database |
| The PDF and OCR libraries, the Python version and its tooling | Not researched |
| Who approves, through what, and how the approver is identified in the record | The `Trigger` value `person` exists, but an audit entry carries no identity of a person ([`INTERFACES.md`](../../architecture/INTERFACES.md)). The research notes that signature fields can be added later as columns on approval records. The same gap applies to a purge run with the command of FL-061: its audit entries say `person` and not which person |
| What happens to a pending proposal when a newer document version arrives | Not designed |
| How an organisation maps to namespaces: one namespace each, or several | Not designed. [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md) makes the namespace the only partition |
| How a caller is authenticated, and whether Postgres row-level security backs the partition | The research names row-level security with phase 4. See the open decisions of [EPIC-10](EPIC-10.md) |
| Whether per-fact access control inside an organisation is needed in this phase | The research says it is "needed from phase 4 or 5, not before", and that it is additive: a nullable label and a filter in the read path. REQ-33 does not name it; REQ-34 does |
| Whether the SQLite adapter must support this domain, or only Postgres | Not decided. Both adapters pass one contract suite, so a table added for proposals exists in both |
