# EPIC-12: Domain adapters

| | |
|---|---|
| Status | Pending |
| Phases | 6 |
| Packages | `packages/adapters` (one domain adapter per domain), `packages/core`, both storage adapters, `apps/api` |
| Requirements | REQ-34 |

Nothing in this epic is implemented, and it has no work items yet. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md). A field of use is a **domain**, and the module that serves one is a **domain adapter**.

Everything about the seven domains below is taken from one research document, [`other-industries.md`](../../research/industries/other-industries.md), accessed 2026-11-13. Rule numbers such as R5 refer to the table in its section 0, which holds the citations.

**This is not legal advice.** The research states what regulations say; whether a deployment complies with any of them is a question for a qualified professional. Several regulation texts were read from mirrors, not from the official publications, and some were not read at all. They are listed as unverified in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), rows Q-59 to Q-65, and nothing here may be treated as verified until those rows are closed.

## Outcome

The generic core serves seven further domains, each through a domain adapter that supplies its own entity types, predicates, extraction instructions and **correction policy**. Where a domain needs something an adapter cannot supply, the core gains it as an added table, column or job, never by rewriting what the first schema means. The domains are delivered in order of distance from what phases 0 to 5 provide, with healthcare last.

## Scope

- One domain adapter for each of: legal; compliance and regulation; healthcare; customer support and CRM; enterprise knowledge management, with personal business memory as its single-user variant; finance and research; manufacturing and operations.
- For each adapter, an eval scenario set in the format of [`TESTING.md`](../../architecture/TESTING.md).
- The core additions listed under "What the adapters need from the core", each built when the first adapter that needs it is built.
- Before a regulated adapter is built: reading the regulations that bear on it in their official texts, and closing the matching rows in `OPEN-QUESTIONS.md`.

## Out of scope

- The generic core, Postgres and the HTTP API: [EPIC-10](EPIC-10.md).
- Document versions as sources, the worker for PDF files and scans, the approval flow, and several client organisations on one deployment: [EPIC-11](EPIC-11.md).
- Compliance of any deployment with any regulation. That is determined per deployment by a qualified professional.
- Being the system of record. In every domain below Factloom holds knowledge taken from other systems and points at its sources ([`PRODUCT.md`](../../product/PRODUCT.md)).
- Time series from sensors. The research excludes them: they are not knowledge taken from text.
- Connectors to particular products. The research lists existing products in each domain by their vendors' descriptions and compares none of them with Factloom.

## Boundaries and constraints

- **Only a domain adapter knows its domain** (REQ-31). No name from a domain below appears in `core`, `graph-rag` or a storage adapter.
- **The first schema is not rewritten.** The research applied one test to every capability: if adding it later is a nullable column, a new table or a new job, it stays out until needed. Every core addition in this epic is of that kind and arrives through a new numbered migration.
- **Invalidate, never delete; purge is the one exception** ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md), [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)). Most record-keeping rules the research read (R5, R8, R10, R12) require keeping the old value and showing who changed what; erasure under GDPR (R2, R3) is the exception, and applies wherever facts are about people.
- **A conflict is keyed by subject and single-valued predicate** ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)). Several domains below ask for a qualifier in the key. Adding one is a new ADR, decided when the first such adapter is designed.
- **An entity merge is a row that can be undone**, never a rewrite of identifiers (FL-052 and FL-063 in [EPIC-09](EPIC-09.md)). The research calls a wrong merge of two patients, parties or companies unacceptable otherwise.
- **Changes go through the fact operations**, also when a person approves them, and reads stay within a **namespace** ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- **No statement about a regulation or a product is added here that is not in the research document.**

## Dependencies

| Epic | Why |
|---|---|
| [EPIC-10](EPIC-10.md) | The domain adapter package, Postgres, and the HTTP API. Private deployment depends on what that epic decides |
| [EPIC-11](EPIC-11.md) | Document versions as sources, text derived from PDF files and scans, the approval flow, and several client organisations on one deployment. Every domain below uses document versions as sources, in all or some deployments |
| [EPIC-08](EPIC-08.md) | Correction policy per domain, proposals (FL-043, FL-070), feedback (FL-046, FL-059, FL-060) and purge (FL-047, FL-061, FL-072) |
| [EPIC-09](EPIC-09.md) | Reversible entity merge (FL-052, FL-063) with duplicate detection (FL-053, FL-064), verification (FL-049, FL-050, FL-071, FL-062, FL-051) and archiving (FL-055, FL-065, FL-073) |
| [EPIC-07](EPIC-07.md) | The scenario format and runner each adapter's eval set reuses |

## What phases 0 to 5 already provide

Each subsection below lists only what a domain needs beyond this.

| Provided | By |
|---|---|
| Bi-temporal facts, sources with locator, version and content hash, and an audit log with no free text | Phase 1 |
| A namespace on every row | Phase 1 |
| Correction policy per domain, proposals for human approval, feedback, purge | Phase 2 |
| Reversible entity merge, verification against sources, archiving | Phase 3 |
| Postgres and an HTTP API | Phase 4 |
| Document versions as sources, an approval flow a person can use, several client organisations on one deployment | Phase 5 |

## Adapter requirements

In the predicate lists, "single-valued" marks what the research calls functional: one current value per subject. The names are the research's proposals, not final; each adapter starts with the few its eval scenarios use.

### 1. Legal

| | |
|---|---|
| Entity types | Document (contract, amendment, order), Clause, Party, Matter, Obligation, Term, Jurisdiction |
| Predicates | `party_to`, `contains`, `amends`, `supersedes`, `obligates`, `belongs_to`. Single-valued: `has_value`, `governed_by`, `due_on`, `effective_from`, `terminates_on` |
| Data sources | Signed contracts and amendments as PDF, Word or scans; contract lifecycle systems; document management systems with their own version numbers; email; court filings |
| Correction policy | Human approval. A supersession takes effect only when a person approves it |
| Time | "What did it say on this date" is an as-of question over `has_value` facts whose valid time comes from the effective dates of the amendments, not from the date of upload |

Needs from the core beyond phases 0 to 5:

- Per-fact access control, with labels inherited from the source document and the matter, for privilege and for separating matters.
- Legal hold: a flag per matter that blocks purge and archiving.
- Private deployment.

Regulations that bear on it: privilege and work-product protection (FRE 502, R14); legal hold and discovery (FRCP 37(e), R13), under which the audit log and invalidated facts are themselves discoverable; GDPR Art. 16 and 17 (R1, R2), where the exceptions in Art. 17(3) are a case-by-case legal judgment; the EU AI Act Annex III(8) (R15), whose application to a law-firm knowledge tool needs professional assessment. Bar rules on confidentiality and conflicts were not read (Q-65).

### 2. Compliance and regulation

| | |
|---|---|
| Entity types | Regulation, Requirement, Policy, Control, Evidence, Owner, Risk, Framework |
| Predicates | `requires`, `maps_to`, `implements`, `evidenced_by`, `supersedes`. Single-valued: `owned_by`, `in_force_from`, `repealed_on`, `review_due`, `last_reviewed` |
| Data sources | Published regulation texts and their amendments; internal policy documents; control libraries in governance, risk and compliance tools; audit reports; tickets and screenshots used as evidence |
| Correction policy | Human approval for invalidating a mapping. When a new version of a regulation arrives, the `maps_to` facts that pointed at changed requirements are flagged or invalidated |
| Time | "Which controls covered requirement X while version N was in force" is a question on valid time |

Needs from the core beyond phases 0 to 5:

- Effective-dated versions of a whole regulation. The research says these are ordinary facts once sources are versioned.
- Date values that a job can compare, for a self-healing job that flags overdue reviews (`review_due`).
- A check for a control with no current `maps_to`. The research places it in the adapter, as a graph question.

Regulations that bear on it: this domain tracks the rules of the others, so the list is open-ended. Those with consequences for Factloom itself are ISO/IEC 27001 and SOC 2 (R18; the ISO text was not read, Q-62), Sarbanes-Oxley s. 404 and 18 USC 1519 (R12), the EU AI Act Art. 12 on logging (R15, with dates in R16 that rest on secondary sources, Q-60), and GDPR for the named owners and reviewers (R1 to R3).

### 3. Healthcare

Delivered last. The research found that it needs the most from the core.

| | |
|---|---|
| Entity types | Patient, Condition, Medication, MedicationStatement or order, Procedure, Observation, Encounter, Practitioner, Organization, Allergy |
| Predicates | `has_condition`, `takes`, `prescribed_by`, `performed_at`, `observed`, `allergic_to`, `contraindicates`, `same_as` |
| Data sources | Electronic health record systems through FHIR interfaces or HL7 v2 feeds; clinical notes and discharge letters; lab systems; scanned referrals |
| Correction policy | Human approval for every correction and every entity merge |
| Time | The adapter maps from FHIR resource types (R17) and does not invent its own. Onset, abatement and effective period map to valid time; recorded and asserted dates map to recorded time; "entered in error" maps to an invalidation |

Needs from the core beyond phases 0 to 5:

- Per-fact access control per user.
- Read-access auditing: a record of who read what. The audit log of phases 1 to 5 records changes only.
- Entity merges proposed for approval, on top of the reversible merge of phase 3.
- Values with units, for a dose or a lab value.
- Annotations on facts, for a statement of disagreement attached to a record.
- An erasure path for GDPR cases alongside retention duties that forbid deletion in others.
- Private deployment, and agreements with every subprocessor including the LLM provider. The research notes that these are deployment and contract matters, and that they decide whether extraction through a hosted LLM can be used at all.

Regulations that bear on it: the HIPAA right to amend, 45 CFR 164.526 (R5), under which an amendment is made by appending or linking; the HIPAA Security Rule, 45 CFR 164.312 and 164.316 (R6, R7); GDPR (R1 to R3); 21 CFR Part 11 (R8) where records are kept under FDA rules, not for ordinary care records; the EU AI Act for medical-device AI (R15), which needs professional assessment; and HL7 FHIR R4 (R17) as the interchange standard. HHS guidance and the status of proposed Security Rule changes were not read in a primary source (Q-63).

### 4. Customer support and CRM

| | |
|---|---|
| Entity types | Customer, Account, Ticket, Product, ProductVersion, Policy, Answer, Agent |
| Predicates | `works_at`, `opened`, `about`, `resolved_by`, `answers`, `applies_to`, `reported_wrong`, `same_as`. Single-valued: `has_policy` per kind of policy, `entitled_to` |
| Data sources | Ticket systems; chat and call transcripts; help-centre articles; release notes; policy documents; CRM records |
| Correction policy | Automatic for answers, human approval for policies. Two triggers: a product or policy change, and **feedback** from a customer or an agent that an answer is wrong |
| Time | "The answer valid today" is the default question about current facts |

Needs from the core beyond phases 0 to 5:

- Nothing new in kind. The research's verdict is "adapter alone, with one core dependency": purge of personal data, covering customer facts, transcripts and embeddings, which phase 2 provides.
- A correction policy that differs by predicate inside one domain. The `Domain` type has one policy per domain today ([`INTERFACES.md`](../../architecture/INTERFACES.md)).

Regulations that bear on it: GDPR Art. 16 and 17 (R1 to R3); the research names this as the domain with the most erasure requests in practice. SOC 2 and ISO/IEC 27001 (R18) are expected by business customers of a hosted service. The EU AI Act Annex III(5) (R15) covers credit scoring and insurance pricing, not ordinary support; its transparency duties for chatbots were not read (Q-60). Support in finance or health inherits those sectors' rules.

### 5. Enterprise knowledge management

| | |
|---|---|
| Entity types | Document (page, file), Decision, Team, Person, Project, System, Topic, Meeting |
| Predicates | `decided_in`, `decided_by`, `supersedes`, `member_of`, `about`, `links_to`, `duplicates`. Single-valued: `owned_by`, `reports_to`, `last_verified` |
| Data sources | Wikis; shared drives; chat; meeting notes and transcripts; ticket systems; HR directories. Each has its own permission model |
| Correction policy | Human approval in some deployments, according to the research's capability table. Self-healing is mostly deterministic: dead links, stale pages, duplicated content. An LLM is needed only to decide which of two conflicting documents is current |
| Time | Stale pages are found from `last_verified` or the last modification being older than a threshold |

Needs from the core beyond phases 0 to 5:

- Per-fact access control. A fact taken from a restricted page must not reach a user who cannot open that page. The research calls this the gap, and harder here than elsewhere, because permissions come from many source systems and change after the facts were recorded.
- A way to check a fact's access label again when the permissions of its source change. How is an open design question in the research.
- A job that flags pages whose review is overdue.

Regulations that bear on it: source permissions are not a regulation but are the dominant requirement. GDPR (R1 to R3) applies to employee personal data, with employment-law exceptions that need professional judgment. ISO/IEC 27001 and SOC 2 (R18) are the assurance expected of the system. The EU AI Act Annex III(4) (R15) makes employment decisions high-risk: a knowledge tool should not be used to evaluate employees, which is a boundary of use to state, not a feature.

#### 5a. Personal business memory, the single-user variant

One person keeps their own deals, agreements and commitments, captured by voice note or chat. The research finds it the closest of all to the phase 1 coding memory in shape: single user, local, automatic correction.

| | |
|---|---|
| Entity types | Person, Company, Deal, Agreement, Commitment, Meeting |
| Predicates | `agreed`, `promised`, `met_at`. Single-valued: `works_at`, `due_on`, `has_status` |
| Data sources | Speech and chat. A transcription step comes before extraction; the source is an audio file or a message plus its transcript |
| Correction policy | Automatic for the user's own statements. The user is the only approver, so approval becomes a confirmation prompt. Transcripts contain misheard names and numbers, so confirmation by the user is the main correction path |
| Time | Relative dates such as "by next Friday" are resolved against the time of capture |

It needs no new concept from the core: date values that can be compared, for commitments that are due or overdue; a source whose text is derived from another artefact, which is the same shape as OCR text of a scan; and purge. It needs no access control and serves one user. Transcription belongs with the worker of [EPIC-11](EPIC-11.md), outside the core.

On privacy: the notes contain personal data about third parties who do not know they are recorded. Whether GDPR's household exemption covers such business use was not verified (Q-61), and recording calls is separately regulated in many places; call-recording laws were not read (Q-65). Audio sent to a transcription service leaves the device.

### 6. Finance and research

| | |
|---|---|
| Entity types | Company (with identifiers), Filing, Person, Event, Metric, Period, Security, Analyst report |
| Predicates | `filed`, `reports`, `restates`, `acquired`, `mentioned_in`, `same_as`. Single-valued: `has_value` per metric and period, `holds_role` per role |
| Data sources | Regulatory filings, both structured and free text; earnings call transcripts; press releases; broker research; news; internal models and notes |
| Correction policy | Human approval for revisions |
| Time | A figure describes a period, was known from its filing date, and can be restated later. "What was known at the time" is a known-at question; "the correct figure for 2023" is the current fact for that period. The research concludes that the period has to be part of the fact's key, not its valid time |

Needs from the core beyond phases 0 to 5:

- Values with a unit, a currency and a scale.
- A period qualifier in the conflict key, so that a restatement supersedes only the figure for its own period.
- Per-fact access control, for information barriers between desks.
- A retention lock that blocks purge.
- An audit trail that includes deletions with the identity of the person, if the deployment holds records that fall under R10 or R11.
- A tamper-evident audit log. The research's capability table marks it as required for this domain.
- A dedicated test of known-at questions. The research names this as the domain that depends on them most.
- Private deployment.

Regulations that bear on it: SEC Rule 17a-4 (R10) and FINRA Rule 4511 (R11) for broker-dealers; whether a Factloom deployment holds "required records" is a compliance determination (Q-64). Sarbanes-Oxley (R12), with seven-year retention of audit work papers. GDPR (R1 to R3) for named individuals. The EU AI Act Annex III(5) (R15): a research memory is not high-risk, but using its facts for credit scoring or insurance pricing would be. Information-barrier rules were not read (Q-65).

### 7. Manufacturing and operations

| | |
|---|---|
| Entity types | Equipment, Part, Procedure, Revision, Supplier, Specification, Site, Nonconformance |
| Predicates | `has_revision`, `applies_to`, `supplied_by`, `replaces`, `installed_in`, `approved_by`, `raised_against`. Single-valued: `current_revision`, `has_spec` per parameter, `review_due` |
| Data sources | Product lifecycle and quality management systems; controlled documents with revision blocks; ERP item masters and supplier agreements; maintenance logs |
| Correction policy | Human approval. Each revision already has a number, an effective date and an approver, which maps to supersession with valid time taken from the effective date |
| Time | Repairing links to replaced parts follows `replaces` relations, a deterministic operation on the graph |

Needs from the core beyond phases 0 to 5:

- Values with units and tolerances.
- Date values that a job can compare, for the overdue-review job (`review_due`).
- Effective-dated revisions of a whole document.
- For contexts under 21 CFR Part 11 only: approval records that carry the signer's name, the time and the meaning of the signature, and validation of the system. The research's stance is that Factloom treats the controlled-document system as the system of record and itself as a derived index. Whether that position holds for a given customer is a regulatory judgment, and the research marks it as a design stance, not an established interpretation (Q-64).

The research's verdict is "adapter alone for unregulated manufacturers; core additions for regulated ones".

Regulations that bear on it: ISO 9001 on documented information (clause text not read, and the status of a revised edition rests on a secondary source, Q-62); the FDA Quality Management System Regulation, 21 CFR Part 820, which incorporates ISO 13485:2016 (R9); 21 CFR Part 11 (R8) where those records are electronic; GDPR (R1 to R3), low, for the names of approvers and operators. Aerospace and automotive quality standards were not read (Q-65).

## What the adapters need from the core

The additions above, collected. "First needed by" follows the order of delivery below. Each is designed when that adapter is designed, and none is built before.

| Addition | First needed by | Also needed by |
|---|---|---|
| Date values that a job can compare, and the overdue-review job | Personal business memory; compliance | Enterprise knowledge management, manufacturing |
| A correction policy that differs by predicate | Customer support | None named |
| Effective-dated versions of a whole document | Compliance | Legal, manufacturing |
| Values with units, tolerance, currency and scale | Manufacturing | Finance, healthcare, and personal business memory in some cases |
| Per-fact access control, with labels inherited from the source | Enterprise knowledge management | Legal, finance, healthcare |
| Checking access labels again when source permissions change | Enterprise knowledge management | None named |
| Legal hold or retention lock that blocks purge and archiving | Legal | Finance |
| A qualifier in the conflict key | Manufacturing (per parameter), finance (per period) | Healthcare |
| A tamper-evident audit log | Finance | Some deployments in legal, compliance, healthcare and manufacturing |
| Deletions recorded with a person's identity | Finance, where R10 or R11 applies | None named |
| Signature fields on approval records | Manufacturing, where Part 11 applies | None named |
| Read-access auditing | Healthcare | None named |
| Annotations on facts | Healthcare | None named |
| Entity merges proposed for approval | Healthcare | None named |
| Private deployment | Legal | Finance, healthcare |

The research also has a full table of capability by domain, in its section (a). That table marks retention schedules as needed in some deployments of most domains; no adapter above requires them outright.

## Order of delivery

By distance from what earlier phases provide, as the research concludes:

1. Personal business memory, and customer support and CRM: an adapter plus purge.
2. Compliance and regulation, and manufacturing and operations for unregulated manufacturers: an adapter plus versioned sources and typed values.
3. Enterprise knowledge management: adds per-fact access control.
4. Legal, and finance and research: add holds, approval and quantities to access control.
5. Healthcare, last: all of the above plus read-access auditing, entity merges under approval, and contractual constraints on the LLM provider.

The research does not place manufacturing for regulated manufacturers in this order. It is proposed here after step 4, because it adds signature fields on approval records; the owner confirms the position when the phase is planned.

## Deliverables

- Seven domain adapters and the single-user variant, each with its eval scenario set.
- The core additions in the table above, each as migrations in both storage adapters with an ADR.
- For each regulated adapter, the rows of `OPEN-QUESTIONS.md` it relies on, closed against the official texts.
- A statement in each adapter's documentation of what it does not establish: compliance of a deployment.

## Success criteria

For each adapter:

- Its eval scenarios pass in replay on every check, with a staleness rate and a false invalidation rate of 0, as for the first domain.
- A search of `core`, `graph-rag` and the storage adapters for its entity types and predicate names finds none outside test data.
- With correction policy `human_approval`, a scenario shows that no fact is invalidated or ended before a person approves, and that a later automatic decision does not override a human one. That second rule is built in [EPIC-11](EPIC-11.md), not in FL-043.
- Every core addition it needs arrived as a new migration, and the storage contract suite passes against every store afterwards.

For the adapters that need them:

- Per-fact access control: a test shows that a caller without access to a source gets no fact taken only from that source, from any retrieval lane, from fact history, or from a count.
- Legal hold: a test shows that purge and archiving are refused for facts under a hold and succeed once it is lifted.
- Read-access auditing: a test shows one record per recall, naming the caller and the facts returned.

For the epic:

- No regulated adapter is marked `Completed` while a row of `OPEN-QUESTIONS.md` that its design relies on is still open.

## Work items

None yet. Work items for this epic are written when phase 6 is near, one adapter at a time in the order above, after the decisions below are made. They follow the template in the [roadmap guide](../README.md) and take the next unused `FL` identifiers.

## Open decisions

Each must be decided, and recorded in an ADR where it is a design decision, before work items can be written.

| Decision | What is known |
|---|---|
| Which of the seven adapters are built at all, and whether this epic is split into one epic per adapter | REQ-34 names all seven. An epic per adapter would take new `EPIC` identifiers; this one would keep its number |
| Whether the regulation texts read on mirrors match the official texts | Q-59, Q-60. Verified before any regulated adapter is designed |
| Whether a derived memory is a "required record", a "designated record set" or an "electronic record", and whether a purge that leaves a content-free record satisfies GDPR Art. 17 | Q-64. Needs professional advice per deployment |
| The model for per-fact access control: what a label is, how it is inherited from a source, and where the filter sits | The research says it is additive: a nullable label and a filter in the one read path. It was expected "from phase 4 or 5"; see the open decisions of [EPIC-11](EPIC-11.md) |
| How labels are checked again when the permissions of a source change | Open design question in the research |
| Whether read-access auditing lives in the core or in the API layer | Open design question in the research; also listed in [EPIC-10](EPIC-10.md). The research says it should be a log separate from the audit log, because of its volume |
| A qualifier in the conflict key, or more specific predicates | [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) rejected a qualifier until a domain proves the need. Finance, with a figure per period, is the case the ADR names |
| How values with units are stored | The research suggests nullable columns beside the value |
| Whether correction policy can differ by predicate | Customer support wants automatic correction for answers and approval for policies |
| How legal hold and retention lock interact with purge, and who may set and lift them | The research says a flag checked by purge and archiving. Not designed |
| Whether retention schedules, purge after a number of years, are built | Marked as needed in some deployments only |
| How the audit log becomes tamper-evident | The research says a hash chain can be computed over existing rows at migration time |
| How an approver and a signer are identified | See the open decisions of [EPIC-11](EPIC-11.md) |
| Which LLM provider a regulated deployment may use, and whether extraction can run without a hosted LLM | The `LlmClient` interface allows another implementation ([ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md)). No alternative has been evaluated for these domains |
| How a refuted claim is recorded, for the healthcare mapping | The research says "a negated or retracted fact". Facts have no negation today |
| Whether enterprise knowledge management extends the document domain of [EPIC-11](EPIC-11.md) or is the same adapter | See the open decisions of [EPIC-11](EPIC-11.md) |
| Where transcription for personal business memory runs | The research places it with the Python worker |
| The rules not read at all: bar confidentiality rules, information-barrier rules, call-recording laws, sector quality standards | Q-65. Read before the corresponding adapter is designed |
