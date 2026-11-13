# Other industries: can the generic core serve them through adapters?

Accessed: 2026-11-13.

## Question

Factloom's generic core (bi-temporal facts, sources, confidence, audit log, invalidate-never-delete,
per-adapter correction policy) must later serve seven industries besides software development: legal;
compliance and regulation; healthcare; customer support and CRM; enterprise knowledge management;
finance and research; manufacturing and operations. For each: which entity and relation types, where
the data comes from, which regulations and standards matter, which products already exist, and
whether an adapter alone is enough. Where it is not, what exactly must the core provide, and which of
those things must be in the first schema?

This document states what regulations say, with citations. It is not legal advice. Whether a given
deployment complies with any of them is a question for a qualified professional.

Confidence labels: **confirmed** (read in the primary text or the regulator's page, or in a faithful
mirror of it), **likely** (secondary sources), **unverified** (Open questions only).

Source notes. `ecfr.gov`, `sec.gov`, `hhs.gov` and `iso.org` could not be read from this session
(redirect to a bot check, or HTTP 403). US regulation and statute text was read on Cornell's Legal
Information Institute (`law.cornell.edu`), which mirrors the eCFR and US Code. GDPR articles were
read on `gdpr-info.eu`, an unofficial mirror, because `eur-lex.europa.eu` returned an empty page.
Product one-liners are taken from each vendor's own page title or description on 2026-11-13 and are
descriptions by the vendor, not assessments.

## Findings

### 0. Regulations and standards read for this document

| # | Rule | What it says (short) | Source | Confidence |
|---|---|---|---|---|
| R1 | GDPR Art. 16 | A data subject can obtain rectification of inaccurate personal data without undue delay, and completion of incomplete data, including by a supplementary statement. | https://gdpr-info.eu/art-16-gdpr/ | confirmed (mirror) |
| R2 | GDPR Art. 17 | Erasure on grounds (1)(a) to (f), for example data no longer necessary, consent withdrawn, unlawful processing. Art. 17(3) exceptions include (b) compliance with a legal obligation, (c) public health, (d) archiving and research where erasure would seriously impair the purpose, (e) establishment, exercise or defence of legal claims. | https://gdpr-info.eu/art-17-gdpr/ | confirmed (mirror) |
| R3 | EDPB Guidelines 02/2025 v2.0 (adopted 7 July 2026) | Written for blockchains, the closest regulator text on append-only stores: "technical impossibility cannot be invoked to justify non-compliance with GDPR requirements"; erasure and objection "must be complied with by design"; where deletion is impracticable, data must be capable of being "effectively rendered anonymous", which presupposes erasing off-chain data that allows identification; the EDPB "recommends looking at other tools if the strong integrity property ... is not needed". | https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202502_blockchain_v2_en.pdf (paras. 50, 102-104) | confirmed |
| R4 | ICO guidance on erasure (UK) | For backups, "the key issue is to put the backup data 'beyond use', even if it cannot be immediately overwritten". The page is marked as under review following the Data (Use and Access) Act. | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/ | confirmed |
| R5 | HIPAA Privacy Rule, 45 CFR 164.526 | Right to request amendment of PHI in a designated record set. The entity must act within 60 days (one 30-day extension). It may deny if the record is accurate and complete or it did not create it. On acceptance it must identify the affected records and "append or otherwise provide a link" to the amendment, and inform others. On denial the individual may file a statement of disagreement, which must be appended and included in future disclosures. | https://www.law.cornell.edu/cfr/text/45/164.526 | confirmed (mirror) |
| R6 | HIPAA Security Rule, 45 CFR 164.312 | Technical safeguards: (a)(1) access control limited to persons or programs granted access, (b) audit controls that record and examine activity, (c)(1) integrity against improper alteration or destruction, (d) person or entity authentication, (e)(1) transmission security. | https://www.law.cornell.edu/cfr/text/45/164.312 | confirmed (mirror) |
| R7 | 45 CFR 164.316(b)(2)(i) | Required documentation is retained "for 6 years from the date of its creation or the date when it last was in effect, whichever is later". | https://www.law.cornell.edu/cfr/text/45/164.316 | confirmed (mirror) |
| R8 | 21 CFR 11.10(e) and 11.50 | Electronic records under FDA rules need "secure, computer-generated, time-stamped audit trails" of create, modify and delete actions; "Record changes shall not obscure previously recorded information"; trails are kept at least as long as the records. A signed record must show the signer's printed name, date and time, and the meaning of the signature (review, approval, responsibility, authorship). 11.10(a) requires system validation; (d) and (g) limit access and actions to authorised individuals. | https://www.law.cornell.edu/cfr/text/21/11.10 ; https://www.law.cornell.edu/cfr/text/21/11.50 | confirmed (mirror) |
| R9 | FDA QMSR, 21 CFR Part 820 | The Quality Management System Regulation incorporates ISO 13485:2016 by reference; effective 2 February 2026. | https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr | confirmed |
| R10 | SEC Rule 17a-4(f)(2), 17 CFR 240.17a-4 | Broker-dealer electronic records must either (i)(A) be preserved with "a complete time-stamped audit trail" covering all modifications and deletions, the date and time of actions, the identity of the individual, and information needed to re-create the original record, or (i)(B) be kept exclusively in a non-rewriteable, non-erasable format. Retention under (a) and (b) is six or three years depending on the record. | https://www.law.cornell.edu/cfr/text/17/240.17a-4 | confirmed (mirror) |
| R11 | FINRA Rule 4511 | Members preserve books and records as required; default retention is at least six years where no period is specified; format and media must comply with SEA Rule 17a-4. | https://www.finra.org/rules-guidance/rulebooks/finra-rules/4511 | confirmed |
| R12 | Sarbanes-Oxley: 15 USC 7262 (s. 404), 18 USC 1519, 17 CFR 210.2-06 | Annual report contains management's assessment of internal control over financial reporting. Knowingly altering, destroying or falsifying records to obstruct a federal matter is a crime (up to 20 years). Auditors retain audit and review records for seven years, including records inconsistent with final conclusions. | https://www.law.cornell.edu/uscode/text/15/7262 ; https://www.law.cornell.edu/uscode/text/18/1519 ; https://www.law.cornell.edu/cfr/text/17/210.2-06 | confirmed (mirror) |
| R13 | FRCP 37(e) | If electronically stored information that should have been preserved in anticipation or conduct of litigation is lost because a party failed to take reasonable steps, the court may order curative measures; severe sanctions require intent to deprive. This is the basis of legal holds. | https://www.law.cornell.edu/rules/frcp/rule_37 | confirmed |
| R14 | FRE 502 | Governs waiver of attorney-client privilege and work-product protection; under (b) an inadvertent disclosure is not a waiver if the holder took reasonable steps to prevent and to rectify it. | https://www.law.cornell.edu/rules/fre/rule_502 | confirmed |
| R15 | EU AI Act Art. 12 and Annex III | High-risk systems must allow automatic recording of events (logs) over their lifetime. Annex III areas include employment decisions, credit scoring and life or health insurance pricing, and assisting judicial authorities in researching and applying the law. | https://artificialintelligenceact.eu/article/12/ ; https://artificialintelligenceact.eu/annex/3/ | confirmed (unofficial mirror) |
| R16 | EU AI Act timing | Regulation (EU) 2026/1744 (the "AI Omnibus"), in force 27 July 2026, moved application of Annex III high-risk obligations to 2 December 2027 and Annex I to 2 August 2028. | law-firm summaries, e.g. https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act ; dates also shown on the mirror in R15 | likely |
| R17 | HL7 FHIR R4 | Resources carry their own status and time fields. `Condition`: `clinicalStatus`, `verificationStatus` (unconfirmed, provisional, differential, confirmed, refuted, entered-in-error), `onset[x]`, `abatement[x]`, `recordedDate`. `MedicationStatement`: `status` (active, completed, entered-in-error, intended, stopped, on-hold, unknown, not-taken), `effective[x]` (dateTime or Period), `dateAsserted`, `informationSource`, `derivedFrom`. `Resource.meta`: `versionId`, `lastUpdated`, `source`, `security` labels. `Provenance`: `target`, `occurred[x]`, `recorded`, `agent`, `entity` with role (derivation, revision, quotation, source, removal), `signature`. `AuditEvent` is the separate security log. | https://hl7.org/fhir/R4/condition.html ; https://hl7.org/fhir/R4/medicationstatement.html ; https://hl7.org/fhir/R4/resource.html ; https://hl7.org/fhir/R4/provenance.html ; https://hl7.org/fhir/R4/auditevent.html | confirmed |
| R18 | SOC 2 | AICPA trust services criteria categories: security, availability, processing integrity, confidentiality, privacy. | https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2 | confirmed (category names only) |

Three observations that recur below:

- Most record-keeping rules (R5, R8, R10, R12) require the opposite of deletion: keep the old value,
  show who changed what and when. Factloom's "invalidate, never delete" plus an audit log is the same
  shape. HIPAA amendment is literally "append or link" (R5).
- GDPR erasure (R2, R3) is the exception and it applies in every industry that stores facts about
  people. An append-only design is not accepted as a reason not to erase (R3).
- FHIR already separates "when it was true" (`onset`, `effective`) from "when it was recorded"
  (`recordedDate`, `dateAsserted`, `meta.lastUpdated`) and separates "stopped" from "entered in
  error" (R17). That is the bi-temporal model: `valid_to` for stopped or superseded,
  `invalidated_at` for entered in error.

---

### 1. Legal

**Entities and relations**

| Entity types | Relation types (F = functional, one current value) |
|---|---|
| Document (contract, amendment, order), Clause, Party (person or organisation), Matter, Obligation, Term (defined value such as a notice period), Jurisdiction | `party_to` (Party to Document), `contains` (Document to Clause), `amends` / `supersedes` (Document or Clause to earlier one), `has_value` (Clause or Term to literal, F), `governed_by` (Document to Jurisdiction, F), `obligates` (Clause to Party), `due_on` (Obligation to date, F), `effective_from` / `terminates_on` (Document to date, F), `belongs_to` (Document to Matter) |

"What did it say on this date" is a valid-time query over `has_value` facts whose validity comes from
the effective dates of the amendments, not from the upload date.

**Where the data comes from.** Signed contracts and amendments (PDF, Word, scans needing OCR),
contract lifecycle systems, document management systems with their own version numbers, email, court
filings.

**Regulations and standards**

| Topic | Relevance |
|---|---|
| Privilege and work product (R14) | Facts extracted from privileged documents inherit the privilege. Showing them to the wrong person risks waiver. Needs access labels on facts and sources. |
| Legal hold and eDiscovery (R13) | When litigation is anticipated, relevant information must not be destroyed. Any purge or retention job must be suspendable per matter. The audit log and invalidated facts are themselves discoverable. |
| GDPR Art. 16, 17 (R1, R2) | Contracts name individuals. Art. 17(3)(e) (legal claims) and (b) (legal obligation) often apply, but that is a case-by-case legal judgment. |
| EU AI Act Annex III(8) (R15) | Covers systems intended for judicial authorities. A law-firm knowledge tool is not obviously in scope; needs professional assessment. |
| Professional confidentiality rules | Bar rules on client confidentiality and conflicts ("ethical walls") vary by jurisdiction. Not read here. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [Harvey](https://www.harvey.ai) | "Legal AI tailored for leading law firms and corporate legal teams"; contract analysis, due diligence, litigation |
| [Ironclad](https://www.ironcladapp.com) | "AI Contract Lifecycle Management Software" |
| [iManage](https://imanage.com) | "Knowledge Work Platform for Legal & Professional Services" (document management) |
| [Relativity](https://www.relativity.com) | "Legal data intelligence" platform (eDiscovery) |
| [Everlaw](https://www.everlaw.com) | "AI Built for Litigation and Investigations" |
| [CoCounsel](https://www.thomsonreuters.com/en/cocounsel) | Thomson Reuters' AI assistant "backed by authoritative content" |

**Verdict: adapter plus core additions.** Entity and relation types fit the generic model. The
adapter cannot supply:

- **Per-fact access control**, inherited from the source document and matter (privilege, ethical walls).
- **Document versions as first-class sources**: a clause fact must point to a specific version of a
  specific document, with a content hash, and the document's own effective date must drive `valid_from`.
- **Human approval queue** before a supersession takes effect (already a settled, configurable policy).
- **Legal hold**: a flag that blocks purge and archive for a matter. Meaningful only if purge exists.
- Private deployment and multi-tenancy per client (deployment, phase 4).

---

### 2. Compliance and regulation

**Entities and relations**

| Entity types | Relation types |
|---|---|
| Regulation, Requirement (a clause of a regulation), Policy, Control, Evidence, Owner (person or team), Risk, Framework | `requires` (Regulation to Requirement), `maps_to` (Control or Policy to Requirement), `implements` (Control to Policy), `evidenced_by` (Control to Evidence), `owned_by` (Policy or Control to Owner, F), `in_force_from` / `repealed_on` (Regulation version to date, F), `review_due` (Policy to date, F), `last_reviewed` (Policy to date, F), `supersedes` (version to version) |

The core question, "which controls covered requirement X while version N was in force", is a
valid-time join. Self-correction means: when a new version of a regulation arrives, the `maps_to`
facts that pointed at changed requirements are flagged or invalidated.

**Where the data comes from.** Published regulation texts and their amendments (official journals,
regulator sites), internal policy documents, control libraries in GRC tools, audit reports, tickets
and screenshots used as evidence.

**Regulations and standards.** This industry tracks the others' rules, so the list is open-ended.
Those with direct consequences for the store itself:

| Topic | Relevance |
|---|---|
| ISO/IEC 27001, SOC 2 (R18) | The common frameworks customers map controls to. Also the assurance a hosted Factloom would be asked for. ISO text not read (see Open questions). |
| SOX s. 404 and 18 USC 1519 (R12) | Control assessments and their evidence are records whose alteration matters. Supports append-only history and an audit log. |
| EU AI Act Art. 12 (R15, R16) | Logging duties for high-risk systems; a compliance adapter would track these as content, and Factloom's own audit log is the same kind of record. |
| GDPR (R1 to R3) | Owners and reviewers are named individuals; low volume of personal data. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [Vanta](https://www.vanta.com) | "automates ... SOC 2, HIPAA, ISO 27001, PCI, and GDPR compliance certification" |
| [OneTrust](https://www.onetrust.com) | "manage privacy, consent, and AI governance while automating compliance" |
| [Drata](https://drata.com) | Compliance automation (page returned HTTP 403 from this session; description **likely**) |

**Verdict: adapter alone is nearly enough.** Needs from the core:

- **Document versions as first-class sources** and effective-dated versions of a whole regulation.
  With versioned sources, "version N in force from A to B" is a set of ordinary facts.
- **Date literals as fact values** (`review_due`), so a healing job can flag overdue reviews. No new
  core concept if literal values exist.
- **Human approval queue** for invalidating a mapping (settled policy).
- Orphaned-control detection is a graph query (a Control with no current `maps_to`), adapter level.

---

### 3. Healthcare

Comes last in the owner's plan; the findings support that order.

**Entities and relations**

| Entity types | Relation types |
|---|---|
| Patient, Condition, Medication, MedicationStatement or order, Procedure, Observation, Encounter, Practitioner, Organization, Allergy | `has_condition` (Patient to Condition, with onset and abatement), `takes` (Patient to Medication, with dose literal and period), `prescribed_by`, `performed_at` (Encounter), `observed` (Patient to Observation with value and unit), `allergic_to`, `contraindicates` (Medication to Condition), `same_as` (duplicate Patient or drug entries) |

An adapter should map from FHIR resource types rather than invent its own (R17). The mapping to
Factloom's time fields is direct: `onset`/`abatement` and `effective` to `valid_from`/`valid_to`;
`recordedDate`, `dateAsserted` to `created_at`; `entered-in-error` to `invalidated_at`; `refuted` to
a negated or retracted fact; `Provenance` and `derivedFrom` to the fact's source.

**Where the data comes from.** Electronic health record systems through FHIR APIs or HL7 v2 feeds,
clinical notes and discharge letters (free text, dictation), lab systems, scanned referrals.

**Regulations and standards**

| Topic | Relevance |
|---|---|
| HIPAA right to amend (R5) | Amendment is by appending or linking, and a denied request can leave a statement of disagreement attached to the record. Fits invalidate-and-link; the disagreement needs an annotation attached to a fact. |
| HIPAA Security Rule (R6, R7) | Access control per user, audit controls that record access (reads, not only writes), integrity, authentication. Six-year documentation retention. A proposed overhaul of the Security Rule was not final as of mid-2026 according to secondary sources (**likely**: https://www.fiercehealthcare.com/health-tech/feds-push-back-hipaa-security-rule-overhaul-july-2027). |
| GDPR (R1 to R3) | Health data about EU residents; erasure requests meet Art. 17(3)(c) public-health and legal-obligation exceptions in many but not all cases. Professional judgment needed. |
| 21 CFR Part 11 (R8) | Applies where records are kept under FDA predicate rules (clinical trials, device and drug manufacturing), not to ordinary care records. Requires validation and signature manifestations. |
| EU AI Act (R15) | Medical-device AI falls under Annex I product legislation; classification needs professional assessment. |
| HL7 FHIR (R17) | The interchange standard; resources already carry provenance, period and verification fields. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [Epic](https://www.epic.com) | Electronic health record vendor: "develops software to help people get well" |
| [Abridge](https://www.abridge.com) | "Generative AI for Clinical Conversations" (documentation from conversations) |
| [Medplum](https://www.medplum.com) | Open-source FHIR-based healthcare platform (page had no description; **likely**) |
| [Veeva](https://www.veeva.com) | "The Industry Cloud for Life Sciences" (regulated content and quality, Part 11 context) |

**Verdict: the core is not sufficient as settled; healthcare needs the most.**

- **Per-fact access control and read auditing.** The audit log as settled records changes. R6(b)
  concerns activity in the system, which includes who read what.
- **Human approval** for every correction and every merge (settled policy), and **reversible entity
  merges**: a wrong patient merge mixes two people's records, so a merge must be a link that can be
  undone, not a rewrite of identifiers.
- **Quantitative values with units** (dose, lab value) as fact values.
- **Erasure path** for GDPR cases, alongside retention duties that forbid deletion in others.
- **Annotations on facts** (statement of disagreement).
- Private deployment, business associate agreements with every subprocessor including the LLM
  provider, and validation where Part 11 applies. These are deployment and contractual matters, not
  schema matters, and they decide whether the default hosted-LLM extraction path can be used at all.

---

### 4. Customer support and CRM

**Entities and relations**

| Entity types | Relation types |
|---|---|
| Customer (person), Account (organisation), Ticket, Product, ProductVersion, Policy (refund, warranty), Answer (a reusable resolution), Agent | `works_at` (Customer to Account), `opened` (Customer to Ticket), `about` (Ticket to Product or ProductVersion), `resolved_by` (Ticket to Answer), `answers` (Answer to question topic), `applies_to` (Answer or Policy to ProductVersion), `has_policy` (Product to Policy, F per policy kind), `entitled_to` (Account to plan or tier, F), `reported_wrong` (Customer or Agent to Answer), `same_as` (duplicates) |

"The answer valid today" is the default current-time query. Self-correction has two triggers here: a
product or policy change (new source supersedes) and feedback (a customer or agent marks an answer
wrong), which is the feedback path already in Product 2.

**Where the data comes from.** Ticket systems, chat and call transcripts, help-centre articles,
release notes, policy documents, CRM records.

**Regulations and standards**

| Topic | Relevance |
|---|---|
| GDPR Art. 16, 17 (R1 to R3) | The industry with the most erasure requests in practice: consumers ask for their data to be deleted, and Art. 17(3) exceptions apply less often than in regulated record-keeping. A store that cannot erase a customer's facts and source text is a problem here first. |
| SOC 2 / ISO 27001 (R18) | Expected by business customers of any hosted service. |
| EU AI Act (R15) | Annex III(5) covers credit scoring and insurance pricing, not ordinary support. Transparency duties for chatbots were not read (Open questions). |
| Sector rules | Support in finance or health inherits those sectors' rules. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [Zendesk](https://www.zendesk.com) | "AI-Powered Customer Service Platform" |
| [Salesforce Agentforce](https://www.salesforce.com/agentforce/) | "Build and customize autonomous AI agents to support your employees and customers" |
| [Intercom Fin](https://www.intercom.com/fin) | AI support agent (page had no readable description; **likely**) |

**Verdict: adapter alone, with one core dependency.** The model fits without change; correction can
be automatic for answers and approved for policies (both settled). Usage-based archiving is already
in Product 2. The dependency is **hard deletion of personal data** (customer facts, transcripts,
embeddings). Multi-tenancy is needed if one deployment serves several client companies.

---

### 5. Enterprise knowledge management

**Entities and relations**

| Entity types | Relation types |
|---|---|
| Document (page, file), Decision, Team, Person, Project, System, Topic, Meeting | `owned_by` (Document, System or Project to Team or Person, F), `decided_in` (Decision to Meeting or Document), `decided_by`, `supersedes` (Decision or Document), `member_of` (Person to Team), `reports_to` (F), `about` (Document to Topic or System), `links_to` (Document to Document), `duplicates` (Document to Document), `last_verified` (Document to date, F) |

Self-healing here is mostly deterministic: dead links (HTTP status or missing page id), stale pages
(`last_verified` or last-modified older than a threshold), duplicated content (hash or embedding
similarity). The LLM is needed only to decide which of two conflicting documents is current.

**Where the data comes from.** Wikis, shared drives, chat, meeting notes and transcripts, ticket
systems, HR directories. Each has its own permission model.

**Regulations and standards**

| Topic | Relevance |
|---|---|
| Source permissions | Not a regulation but the dominant requirement: a fact extracted from a restricted page must not reach a user who cannot open that page. Requires access labels on facts derived from the source, and re-checking when source permissions change. |
| GDPR (R1 to R3) | Employee personal data; erasure and rectification apply, with employment-law exceptions that need professional judgment. |
| ISO/IEC 27001, SOC 2 (R18) | Assurance expected of the system. |
| EU AI Act Annex III(4) (R15) | Employment decisions are high-risk. A knowledge tool should not be used to evaluate employees; that is a usage boundary to state, not a feature. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [Glean](https://www.glean.com) | "Enterprise AI platform connected to your enterprise's data" |
| [Confluence](https://www.atlassian.com/software/confluence) | "team workspace for creating and sharing knowledge" |
| [Notion](https://www.notion.com) | "The AI workspace"; search across apps and custom agents |

**Verdict: adapter plus per-fact access control.** Everything else is adapter work on top of
document versions as sources. Access control is the gap, and it is harder here than elsewhere because
permissions come from many source systems and change after ingestion.

#### 5a. Personal business memory (single-user variant)

One businessperson keeps their own deals, agreements and commitments, captured by voice note or chat.

| Aspect | What differs from the team case |
|---|---|
| Capture | Speech and chat instead of documents. A transcription step precedes extraction; the source is an audio file or message plus its transcript. Transcripts contain misheard names and numbers, so extraction confidence is lower and confirmation by the user ("did you mean Acme GmbH?") is the main correction path. |
| Entities | Person, Company, Deal, Agreement, Commitment, Meeting. A small subset of sections 1, 4 and 5. |
| Relations | `works_at` (F), `agreed` (Person or Company to Agreement, with terms as literals), `promised` (Person to Commitment), `due_on` (Commitment to date, F), `has_status` (Commitment or Deal, F), `met_at`. |
| Time | Heavy use of relative dates ("by next Friday"), which must be resolved against the capture time. Capture time is `created_at`; the resolved date is a literal value. Commitments need a "due soon / overdue" query, which is a date filter on literals. |
| Correction | The user is the only approver, so the approval queue degenerates to a confirmation prompt. Automatic correction is acceptable for the user's own statements. |
| Privacy | Single-user and local fits the SQLite phase with no access control. The notes contain personal data about third parties who do not know they are recorded. GDPR's household exemption does not cover business activity, so the user is likely a controller (**unverified** as a legal conclusion; professional advice needed). Recording calls is separately regulated in many places. Audio sent to a cloud transcription service leaves the device. |

Existing products in this space, by their own description: [Granola](https://www.granola.ai) ("AI
notepad ... notes, actions and memory. Without a meeting bot"), [Otter](https://otter.ai) ("real-time
transcription ... summaries, insights, and action items"), [Fireflies](https://www.fireflies.ai)
(meeting transcription and summaries), [Limitless](https://www.limitless.ai) ("Personalized AI
powered by what you've seen, said, and heard").

Does it need anything extra from the core? **No new concept.** It needs three things already listed
for other industries: date literals as fact values (commitment due dates), a source type whose text
is derived from another artefact (transcript of audio; the same shape as OCR of a PDF), and hard
deletion (a third party asks to be forgotten, or the user deletes a note). It needs less than the
team case: no access control, no multi-tenancy. Transcription itself belongs with the planned Python
worker for PDF and OCR, outside the core. This variant is the closest of all to the phase 1 coding
memory in shape (single user, local, automatic correction) and could reuse it almost unchanged.

---

### 6. Finance and research

**Entities and relations**

| Entity types | Relation types |
|---|---|
| Company (with identifiers), Filing, Person, Event (earnings call, acquisition), Metric (revenue, margin), Period (fiscal year or quarter), Security, Analyst report | `filed` (Company to Filing), `reports` (Filing to Metric value, for a Period), `has_value` (Company and Metric and Period to number with unit and currency, F per metric and period), `restates` (Filing to Filing), `holds_role` (Person to Company, with dates, F per role), `acquired` (Company to Company), `mentioned_in` (Event to Filing), `same_as` (company name variants) |

Two times matter and they are not the fact's valid time alone. "Revenue for fiscal 2023" refers to a
**period** the number describes; the filing date is when it became **known**; a restatement replaces
the number for the same period at a later known-date. "What was known at the time" is a
recorded-time (as-of) query; "the correct figure for 2023" is the current fact for that period. The
period therefore has to be part of the fact's key, not its validity interval.

**Where the data comes from.** Regulatory filings (structured XBRL and free-text sections), earnings
call transcripts, press releases, broker research, news, internal models and notes.

**Regulations and standards**

| Topic | Relevance |
|---|---|
| SEC Rule 17a-4 (R10), FINRA Rule 4511 (R11) | For broker-dealers, required records must be kept for three or six years either in WORM form or with a complete audit trail that allows re-creation of the original. Whether a Factloom store holds "required records" depends on its use and is a compliance determination. If it does, the audit trail must capture deletions too, with the identity of the person. |
| SOX (R12) | Seven-year retention for audit work papers; destruction of records with intent to obstruct is criminal. Purge features need retention locks. |
| GDPR (R1 to R3) | Named individuals (officers, analysts). Art. 17(3)(b) legal-obligation exception is commonly relevant; case by case. |
| EU AI Act Annex III(5) (R15) | Credit scoring and insurance pricing are high-risk. A research memory is not; using its facts for those decisions would be. |
| Information barriers | Rules on material non-public information require separating what different desks can see. Not read here; implies per-fact access control. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [AlphaSense](https://www.alpha-sense.com) | "Market Intelligence and Search Platform" across company documents and research |
| [Hebbia](https://www.hebbia.com) | "AI built for the rigor of finance" |
| [Bloomberg Terminal](https://www.bloomberg.com/professional/) | Market data and research terminal (page returned HTTP 403 from this session; description **likely**) |

**Verdict: adapter plus core additions.**

- **Quantitative facts**: a literal value with unit, currency and scale, and a **period qualifier in
  the fact key** so that "revenue, FY2023" and "revenue, FY2024" are different slots and a
  restatement supersedes only its own slot.
- **As-of queries on recorded time** are already in the bi-temporal design; this industry is the one
  that depends on them most. Worth a dedicated test.
- **Document versions as sources** (original filing versus amended filing).
- **Per-fact access control** for information barriers; **retention lock** and an audit trail that
  includes deletions if the store falls under R10 or R11.
- Human approval for revisions (settled policy).

---

### 7. Manufacturing and operations

**Entities and relations**

| Entity types | Relation types |
|---|---|
| Equipment, Part (with part number), Procedure (work instruction, SOP), Revision, Supplier, Specification (a parameter with a value), Site, Nonconformance | `has_revision` (Procedure or Part to Revision), `current_revision` (F), `applies_to` (Procedure to Equipment or Part), `has_spec` (Part or Procedure step to value with unit and tolerance, F per parameter), `supplied_by` (Part to Supplier, with terms), `replaces` (Part to Part), `installed_in` (Part to Equipment, with dates), `review_due` (Procedure to date, F), `approved_by` (Revision to Person, with date), `raised_against` (Nonconformance to Part, Procedure or Supplier) |

Revision history is a first-class, well-behaved version chain: each revision has a number, an
effective date and an approver. That maps to supersession with valid time taken from the effective
date. "Repair links to replaced parts" follows `replaces` edges, a deterministic graph operation.

**Where the data comes from.** Product lifecycle and quality management systems, controlled
documents (PDF with revision blocks), ERP item masters and supplier agreements, maintenance logs,
sensor historians (out of scope: time series are not text knowledge).

**Regulations and standards**

| Topic | Relevance |
|---|---|
| ISO 9001 documented information | Requires control of documented information, including identification, review and approval, and version control. Clause text not read (Open questions); a revised edition was scheduled for September 2026 according to certification bodies (**likely**: https://www.lrqa.com/en/latest-news/iso-9001-publication-date-confirmed/). |
| FDA QMSR / ISO 13485:2016 (R9) | Medical-device manufacturers: quality system records under FDA rules from 2 February 2026. |
| 21 CFR Part 11 (R8) | Where those records are electronic: validated system, audit trail that does not obscure prior values, signature showing name, time and meaning on approvals. |
| Sector standards | Aerospace and automotive quality standards add their own document-control rules. Not read here. |
| GDPR (R1 to R3) | Low: approver and operator names. |

**Existing products**

| Product | Vendor's description |
|---|---|
| [MasterControl](https://www.mastercontrol.com) | "modern MES and QMS ... for regulated industries like Life Sciences" |
| [PTC Windchill](https://www.ptc.com/en/products/windchill) | "enterprise PLM software" |
| [Octave Reliance](https://www.etq.com) (formerly ETQ Reliance) | "eQMS Software ... document control, audit management, and compliance" |

**Verdict: adapter alone for unregulated manufacturers; core additions for regulated ones.**

- **Document versions as first-class sources** with revision identifiers and effective dates.
- **Quantitative facts with units** and tolerances.
- **Date literals** (`review_due`) for the overdue-review healing job.
- For Part 11 contexts only: **approval records carrying signer name, time and meaning**, and system
  validation. Factloom should treat the controlled-document system as the system of record and itself
  as a derived index, which keeps Part 11 obligations on the source system. Whether that position
  holds for a given customer is a regulatory judgment.

---

## What it means for Factloom

### (a) Core capability required, by industry

R = required for a credible adapter; S = required in some deployments (regulated subset, hosted
multi-client, EU personal data); blank = not needed. SW = software development (phase 1), PB =
personal business memory.

| Core capability | SW | Legal | Compl. | Health | Support | Ent. KM | PB | Finance | Manuf. |
|---|---|---|---|---|---|---|---|---|---|
| Bi-temporal facts, sources, audit log (settled) | R | R | R | R | R | R | R | R | R |
| Namespace / tenant partition on every row | R (repo, user) | R | S | R | S | R | | R | S |
| Per-fact access control (labels inherited from source) | | R | S | R | S | R | | R | S |
| Human approval queue (settled as policy) | | R | R | R | S | S | | R | R |
| Document versions as first-class sources | R (commit, blob) | R | R | S | S | R | S | R | R |
| Effective-dated versions of a whole document | | R | R | | S | S | | S | R |
| Literal values: dates | S | R | R | R | S | S | R | R | R |
| Literal values: numbers with unit and period | | S | | R | | | S | R | R |
| Qualifier in the functional key (slot, period) | R | S | S | R | S | | S | R | R |
| Hard deletion / purge of content | S (secrets) | S | S | S | R | S | R | S | S |
| Legal hold / retention lock (blocks purge) | | R | S | S | | S | | R | S |
| Retention schedules (purge after N years) | | S | S | S | S | S | | S | S |
| Review-due dates and overdue job | | S | R | | | R | S | | R |
| Reversible entity merge | S | R | S | R | R | S | S | R | S |
| Read-access audit (who saw what) | | S | | R | | S | | S | |
| Annotations on facts (disagreement, comment) | | S | S | R | S | S | | S | S |
| E-signature fields on approvals | | | S | S | | | | | S |
| Tamper-evident audit log (hash chain, WORM) | | S | S | S | | | | R | S |
| Private deployment | | R | S | R | S | S | R (local) | R | S |

### (b) What must be in the first schema, and what can wait

The owner wants a minimal core. The test applied: if this is left out, does adding it later mean
rewriting existing rows' meaning or every query, or is it a new nullable column, a new table or a new
job? Only the first kind belongs in the first schema.

**Would force a rewrite if left out (decide in phase 0, costs little now)**

| # | Requirement | Why it cannot be retrofitted cheaply | Minimal form |
|---|---|---|---|
| 1 | A namespace (partition key) on every entity, fact, source and audit row, and every read taking a caller context | Phase 1 already needs it for repository and user scopes. Retrofitting a partition into every query and index, and deciding which old rows belong where, is a rewrite. Multi-tenancy and access control later hang off the same context argument. | One `namespace` column; one context parameter on the storage interface. No access-control logic yet. |
| 2 | Sources identified by locator plus version plus content hash | Phase 1 needs path, commit and blob id anyway. Every later industry needs "this version of this document". A source table keyed only by URL or path cannot say which version a fact came from, and old facts cannot be re-attributed afterwards. | `source(locator, version, content_hash, retrieved_at, derived_from)`; `derived_from` covers OCR and transcripts. |
| 3 | A fact's object can be an entity or a typed literal, and the functional key can include a qualifier | Needed in phase 1 (`slot`, see `software-development.md`) and by finance (period), healthcare and manufacturing (parameter). If uniqueness is fixed as (subject, predicate), supersession logic and stored data must both change. | `object_entity_id` or `object_value` plus `value_type`; a nullable `qualifier` that is part of the supersession key. Units can come later as columns. |
| 4 | Content is purgeable: fact text, source text, embeddings and full-text rows can be irreversibly removed for one item, leaving a tombstone, and the audit log refers to content by id or hash rather than copying it | If the audit log stores before-and-after text inline and is meant to be immutable, erasure (R2, R3) and the removal of a leaked secret become impossible without breaking the log. This is a layout decision made on day one. | Keep text in the fact and source rows only; audit rows hold ids, action, actor, reason, time. Define `purge` as an audited operation even if phase 1 does not expose it. |
| 5 | Entity merges recorded as reversible links | Phase 3 merges duplicates. If merging rewrites entity ids on facts, a wrong merge cannot be undone, which is unacceptable for patients, parties and companies. | Never rewrite ids; store `merged_into` or a `same_as` fact with its own validity and resolve at read time. |

**Can be added later by migration (leave out now)**

| Capability | Why later is safe |
|---|---|
| Per-fact access-control labels and enforcement | A nullable label column plus a filter inside the single read path created by item 1. Hard work, but additive. Needed from phase 4 or 5, not before. |
| Approval queue | A fact status (`proposed`, `active`) and a table of pending changes. Existing rows default to active. |
| Units, currency, tolerance on literal values | Nullable columns next to `object_value`. |
| Review-due and retention schedules | Date literals plus scheduled jobs; policy lives in the adapter. |
| Legal hold and retention lock | A flag checked by purge and archive. Needs item 4 to exist as a concept. |
| Annotations on facts | A new table referencing fact ids. |
| Read-access audit | A new, separate log table; high volume, so it should be separate from the change log anyway. |
| E-signature fields | Columns on approval records. Audit rows should have `actor` and `reason` from the start because they are free, but signatures can wait. |
| Tamper-evident audit log | A hash chain can be computed over existing rows in order at migration time. WORM storage is a deployment property. |
| Effective-dated whole-document versions | Ordinary facts once item 2 exists. |
| Postgres, row-level security, private deployment | Already planned for phase 4. |

Items 1 to 3 are needed by phase 1 itself, so they add no speculative scope. Items 4 and 5 are rules
about what not to do (do not copy text into the audit log; do not rewrite ids) rather than features.

### Conflicts with settled decisions

One, narrow. **"Invalidate, never delete" cannot be absolute.**

- Evidence: GDPR Art. 17 gives individuals a right to erasure (R2). The EDPB states that technical
  impossibility cannot justify non-compliance and that erasure must be designed in; for append-only
  stores it expects data to be made effectively anonymous, including erasing the data that allows
  identification (R3). The ICO accepts "beyond use" only for backups awaiting overwrite (R4). In
  phase 1, a credential captured in a memory raises the same need without any regulation.
- Not in conflict: HIPAA amendment (R5), Part 11 (R8), Rule 17a-4 (R10) and SOX (R12) all favour
  keeping history, and legal hold (R13) forbids deletion in specific cases.
- Suggested reading of the rule: invalidation is the only way knowledge changes; **purge** is a
  separate, rare, audited operation that removes content (not the tombstone or the audit entry), can
  be blocked by a hold, and is disabled or restricted by adapter policy where retention rules apply.
  Whether anonymised tombstones satisfy Art. 17 in a given case is a legal question.

No other conflict found. Human approval per adapter, source on every fact and an audit log are each
supported by at least one rule above.

### Order of industries

The findings support the owner's plan. By distance from the phase 1 core: personal business memory
and customer support (adapter plus purge); compliance and unregulated manufacturing (adapter plus
versioned sources and literals); enterprise knowledge management (adds access control); legal and
finance (add access control, holds, approval, quantities); healthcare last (all of the above plus
read auditing, reversible merges under approval, and contractual constraints on the LLM provider).

## Open questions

- **unverified**: ISO 9001 clause 7.5 wording and whether the 2026 edition has been published;
  ISO/IEC 27001 current edition and amendments; ISO 13485 clause text. `iso.org` returned HTTP 403
  and the standards are paid documents.
- **unverified**: GDPR Art. 5(1)(d) (accuracy), 5(1)(e) (storage limitation), Art. 9 (health data)
  and Art. 30 were not read in a primary or mirror text in this session and are not relied on above.
  The household exemption statement in 5a is likewise unverified.
- **unverified**: HHS guidance pages on HIPAA (`hhs.gov` returned HTTP 403). The status of the
  proposed Security Rule changes rests on press reports from mid-2026.
- **unverified**: The official text of Regulation (EU) 2026/1744 was not read; AI Act application
  dates rest on law-firm summaries and an unofficial mirror. AI Act transparency duties for chatbots
  (relevant to customer support) were not read.
- **unverified**: 21 CFR 11.70 (signature and record linking) and 21 CFR Part 820 text were not read.
- **unverified**: Whether a derived knowledge store counts as a "required record" (17a-4), a
  "designated record set" (HIPAA) or an "electronic record" under Part 11 depends on use and needs
  professional determination per deployment. The "derived index, not system of record" position in
  section 7 is a design stance, not an established interpretation.
- **unverified**: Whether purge with a retained, content-free tombstone and audit entry satisfies an
  Art. 17 request. R3 points that way for data rendered anonymous, but it was written about
  blockchains.
- **unverified**: Bar confidentiality and conflict rules, information-barrier rules for financial
  firms, call-recording laws, and sector quality standards for aerospace and automotive were not read.
- **unverified**: Product descriptions for Drata, Bloomberg Terminal, Intercom Fin and Medplum (pages
  blocked or without a readable description). No product was tested. Feature comparisons with
  Factloom were deliberately not attempted.
- Open design question: whether read-access auditing belongs in the core at all or in the HTTP API
  layer planned for phase 4.
- Open design question: how facts derived from a source inherit and later re-check that source's
  permissions when they change after ingestion (enterprise knowledge management).
