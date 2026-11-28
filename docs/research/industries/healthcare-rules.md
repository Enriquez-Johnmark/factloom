# Healthcare rules and FHIR R4, read in their official texts

Accessed: 2026-11-28.

## Question

What do the US health privacy rules, the US and EU rules for AI in healthcare, and HL7 FHIR R4 say about the things a memory component would touch? This document is for designing the healthcare domain adapter (EPIC-13 and [EPIC-12](../../roadmap/epics/EPIC-12.md)). It reads again, in official texts, rules that [`other-industries.md`](other-industries.md) read on mirrors on 2026-11-13, and adds rules that document did not cover.

This document states what rules say, with citations. It is not legal advice. Whether a given deployment complies with any of them is a question for a qualified professional. Kronomind is not ready for patient data.

Confidence labels: **confirmed** (read in the official text or on the regulator's own page), **likely** (a secondary source, or an inference from the text), **unverified** (could not be read).

Source notes:

- eCFR was read through its versioner API, `https://www.ecfr.gov/api/versioner/v1/full/2026-11-25/title-45.xml?part=<part>&section=<section>`, with text current to 2026-11-25. Its HTML pages return a bot check.
- The Federal Register was read through its API, `https://www.federalregister.gov/api/v1/documents/<number>.json`. Its full-text pages return HTTP 403, so rule texts were read on GovInfo (`govinfo.gov/content/pkg/FR-<date>/html/<number>.htm`).
- `hhs.gov` returned HTTP 403, so no HHS guidance was read.
- `eur-lex.europa.eu` returned an empty HTTP 202. The Official Journal text of Regulation (EU) 2024/1689 and Regulation (EU) 2026/1744 was read from the EU Publications Office, `https://publications.europa.eu/resource/celex/<CELEX>` with the header `Accept: application/xhtml+xml`.
- FHIR R4 (4.0.1) pages were read with curl under `https://hl7.org/fhir/R4/`.

The cloud session's research was done by three parallel agents. The most surprising findings were checked again from the same session: the Federal Register entries for 2026-23429, 2024-30983 and 2026-21943, the removal wording in 2026-21943, the AI Omnibus dates in the Official Journal text, and three FHIR definitions.

## Findings

### 1. HIPAA

| # | Rule | What it says (short) | Source | Confidence |
|---|---|---|---|---|
| H1 | 45 CFR 164.526, amendment | (c)(1): an accepted amendment is made by "appending or otherwise providing a link to the location of the amendment". (d)(4): on denial, the entity must "append or otherwise link" the request, its denial, "the individual's statement of disagreement, if any, and the covered entity's rebuttal, if any". (b)(2): act "no later than 60 days", one extension "by no more than 30 days". Matches the mirror wording read on 2026-11-13. | [eCFR 164.526](https://www.ecfr.gov/current/title-45/section-164.526) | confirmed |
| H2 | 164.312, technical safeguards | Standards: access control; audit controls, to "record and examine activity in information systems that contain or use" ePHI; integrity; person or entity authentication; transmission security. Required: unique user identification, emergency access procedure. Addressable: automatic logoff, encryption and decryption, a mechanism to authenticate ePHI, transmission integrity, transmission encryption. | [eCFR 164.312](https://www.ecfr.gov/current/title-45/section-164.312) | confirmed |
| H3 | 164.308(a)(1)(ii)(D) | "Information system activity review (Required)": review "records of information system activity, such as audit logs, access reports". | [eCFR 164.308](https://www.ecfr.gov/current/title-45/section-164.308) | confirmed |
| H4 | 164.316(b)(2)(i) | Documentation is kept "for 6 years from the date of its creation or the date when it last was in effect, whichever is later". | [eCFR 164.316](https://www.ecfr.gov/current/title-45/section-164.316) | confirmed |
| H5 | 164.528, accounting of disclosures | Disclosures "in the six years prior to the date on which the accounting is requested", with date, recipient, a brief description and a purpose. Treatment, payment and health care operations are exempt. Nothing about logging reads. The 2011 access-report proposal (76 FR 31426, RIN 0991-AB62) has no later Federal Register document. | [eCFR 164.528](https://www.ecfr.gov/current/title-45/section-164.528) | confirmed (text); likely (proposal never finalised) |
| H6 | 160.103, 164.502(e), 164.504(e), 164.314 | A business associate "creates, receives, maintains, or transmits protected health information" for a covered entity, and the definition includes a subcontractor that does so for a business associate. Assurances "must be documented through a written contract". The contract must, at termination, "return or destroy all" PHI "if feasible". | [eCFR 160.103](https://www.ecfr.gov/current/title-45/section-160.103), [164.504](https://www.ecfr.gov/current/title-45/section-164.504) | confirmed (text); likely (an LLM provider that receives PHI from a business associate is a subcontractor) |
| H7 | 164.514(a)-(b), 164.502(d)(2), de-identification | Two routes: expert determination that the risk is "very small", or Safe Harbor, removing 18 kinds of identifier and having no "actual knowledge" that the rest identifies someone. "The requirements of this subpart do not apply to information that has been de-identified". | [eCFR 164.514](https://www.ecfr.gov/current/title-45/section-164.514) | confirmed |
| H8 | 164.501, designated record set | "A group of records maintained by or for a covered entity that is … (iii) Used, in whole or in part, by or for the covered entity to make decisions about individuals." | [eCFR 164.501](https://www.ecfr.gov/current/title-45/section-164.501) | confirmed (text). Whether a derived memory is one is a legal question (Q-64) |
| H9 | HIPAA Privacy Rule, 91 FR 74848, FR doc 2026-23429 | "HIPAA Privacy Rule: Changes To Support Coordinated Care and Individual Engagement and Reduce Regulatory Burdens", a final rule published 2026-11-19, effective 2027-01-19, compliance 2027-07-19. Access under 164.524 becomes "no later than 15 calendar days", from 30 days. It adds definitions of "Electronic health record" and "Personal health application", and does not change "designated record set". Its other changes were not read. | [Federal Register 2026-23429](https://www.federalregister.gov/documents/2026/11/19/2026-23429/hipaa-privacy-rule-changes-to-support-coordinated-care-and-individual-engagement-and-reduce) | confirmed |
| H10 | Proposed Security Rule, 90 FR 898, FR doc 2024-30983 | "HIPAA Security Rule To Strengthen the Cybersecurity of Electronic Protected Health Information", a proposed rule published 2025-01-06, RIN 0945-AA22. No final rule and no withdrawal was found in the Federal Register as of 2026-11-28. | [Federal Register 2024-30983](https://www.federalregister.gov/documents/2025/01/06/2024-30983/hipaa-security-rule-to-strengthen-the-cybersecurity-of-electronic-protected-health-information) | confirmed (no final rule found) |
| H11 | 42 CFR 2.2 | Part 2 restricts the use and disclosure of substance use disorder patient records kept by a Part 2 program, separately from HIPAA. | [eCFR 42 CFR 2.2](https://www.ecfr.gov/current/title-42/section-2.2) | confirmed (purpose only) |

### 2. Rules for AI in healthcare

| # | Rule | What it says (short) | Source | Confidence |
|---|---|---|---|---|
| A1 | EU AI Act, Art. 6(1) and Annex I | An AI system is high-risk when it is, or is a safety component of, a product under Annex I legislation that "is required to undergo a third-party conformity assessment". Annex I Section A lists the medical device regulations 2017/745 and 2017/746. | [Regulation (EU) 2024/1689](http://data.europa.eu/eli/reg/2024/1689/oj) | confirmed |
| A2 | EU AI Act, Annex III | Includes eligibility for "essential public assistance benefits and services, including healthcare services", "risk assessment and pricing … life and health insurance", and "emergency healthcare patient triage systems". | same | confirmed |
| A3 | EU AI Act, Arts. 12, 19, 26(6) | High-risk systems "shall technically allow for the automatic recording of events (logs) over the lifetime of the system". Providers and deployers keep logs for "at least six months". | same | confirmed |
| A4 | EU AI Act, Arts. 13 and 14 | Operation "sufficiently transparent to enable deployers to interpret a system's output". A person can "disregard, override or reverse the output" and stays aware of "automation bias". | same | confirmed |
| A5 | Regulation (EU) 2026/1744 | Published in the Official Journal on 24.7.2026. Chapter III Sections 1 to 3 apply from "2 December 2027 as regards AI systems classified as high-risk pursuant to Article 6(2) and Annex III", and from 2 August 2028 for Article 6(1) and Annex I. Whether it changed Arts. 12 to 14 was not checked. | [Regulation (EU) 2026/1744](http://data.europa.eu/eli/reg/2026/1744/oj) | confirmed |
| A6 | ONC 45 CFR 170.315(b)(11), decision support interventions | In force until 2026-12-28: source attributes for predictive interventions, and intervention risk management. The final rule "Health Data, Technology, and Interoperability: ONC Deregulatory Actions To Unleash Prosperity" (91 FR 67916, FR doc 2026-21943, published 2026-10-28, effective 2026-12-28) says "Removing paragraphs (b)(11)(iv) through (vi)". The feedback export stays: "the intervention, action taken, user feedback provided (if applicable), user, date, and location". | [GovInfo 2026-21943](https://www.govinfo.gov/content/pkg/FR-2026-10-28/html/2026-21943.htm) | confirmed |
| A7 | FDA guidance, Clinical Decision Support Software (2026-01-29) | Supersedes the version of 2026-01-06. Criterion 4: the clinician can "independently review the basis for such recommendations". FDA recommends showing "missing, corrupted, or unexpected input data values" and sources such as guidelines "with the date or version". The guidance is not binding. | [FDA guidance page](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software) | confirmed |
| A8 | 45 CFR 92.210 (Section 1557) | An "ongoing duty to make reasonable efforts to identify" decision support tools that use race, sex, age and similar inputs, and to "mitigate the risk of discrimination". | [eCFR 45 CFR 92.210](https://www.ecfr.gov/current/title-45/section-92.210) | confirmed |
| A9 | 42 CFR 422.122, prior authorisation in Medicare Advantage | A denial gives "a specific reason". "Beginning January 1, 2027" a Prior Authorization API is required. The Medicaid, CHIP and Exchange sections were not read. | [eCFR 42 CFR 422.122](https://www.ecfr.gov/current/title-42/section-422.122) | confirmed (Medicare Advantage only) |

### 3. HL7 FHIR R4

FHIR R4 is 4.0.1. R5 (5.0.0) is the current version, and R6 is in ballot. US Core 9.0.0 is "based on FHIR 4.0.1". That US regulation requires R4 is **likely**: 45 CFR 170.215 was not read.

| # | Element | What R4 says (short) | Kronomind | Confidence |
|---|---|---|---|---|
| F1 | `Condition.onset[x]`, `abatement[x]` | Onset: "Estimated or actual date or date-time the condition began". Types: dateTime, Age, Period, Range, string. With no abatement, "it is unknown whether the condition has resolved". | Valid time, partly: an age, a range or text has no exact date | confirmed |
| F2 | `Period.end` | "End time with inclusive boundary, if not ongoing". | Valid time ends exclusively, so the import adds one day | confirmed |
| F3 | `Condition.recordedDate` | "when this particular Condition record was created in the system, which is often a system-generated date". | The source system's time, not Kronomind's recorded time | confirmed |
| F4 | `MedicationStatement.effective[x]`, `dateAsserted` | Effective: the "interval of time during which it is being asserted that the patient is/was/will be taking the medication". dateAsserted: when "the medication statement was asserted by the information source". | Valid time; the source's assertion time | confirmed |
| F5 | `entered-in-error` | Condition and AllergyIntolerance: "The statement was entered in error and is not valid." Observation: "This electronic record should never have existed, though it is possible that real-world decisions were based on it." | A retraction, or the first half of a correction | confirmed |
| F6 | `refuted` | A clinical judgement: the condition was ruled out. Not a record error. | A negated fact, not an invalidation. Not mapped until negation exists | confirmed |
| F7 | Status codes | MedicationStatement: active, completed, entered-in-error, intended, stopped, on-hold, unknown, not-taken. Condition clinical status: active, recurrence, relapse, inactive, remission, resolved. Observation `amended` "includes updates/new information and corrections"; `corrected` is a correction only. | Stopped, completed, inactive, remission and resolved are successions; the others need rules or stay unmapped | confirmed |
| F8 | Versions and history | "servers are allowed to not provide versioning support". History has `_at` and `_since`. "search is only defined to function against the current version of a resource". | No standard query asks what the record said on a past date across resources | confirmed |
| F9 | `meta.source`, Provenance, AuditEvent | `meta.source` allows "Only one nominated source". Provenance has `target`, `occurred[x]`, `recorded`, `agent` and `entity.role` (derivation, revision, quotation, source, removal). AuditEvent is "a record of an event made for purposes of maintaining a security log", including reads and queries. | Sources; a separate log of reads | confirmed |

## What it means for Kronomind

These are design observations, not legal advice. None of them makes any deployment compliant.

- **Amendment by linking (H1).** Invalidating a fact and linking it to its replacement has the shape the amendment rule describes. A statement of disagreement and a rebuttal are linked records too, so they need annotations on facts. It applies only where the memory is part of a designated record set (H8), which is a legal question.
- **Reads are activity (H2, H3).** Audit controls "record and examine activity", and the review names "access reports". Kronomind's audit log records changes only, so read-access auditing is a real gap, as EPIC-12 says.
- **A user identity (H2).** Unique user identification is Required. One local file used by one person has no user identity. It arrives with phase 4.
- **Return or destroy (H6).** Whether a purge that keeps a `[purged]` row meets "return or destroy … if feasible" is unverified (Q-64).
- **The LLM provider (H6).** With patient data, the provider that receives text for extraction is likely a subcontractor needing a written contract. Structured FHIR data can be mapped by rules with no LLM.
- **Invented data (H7).** Invented records, and properly de-identified ones, are outside the Privacy Rule. Free text can still hold an identifier.
- **Showing the basis of an output (A3, A4, A7, A9).** Logs over a system's lifetime, a person who can override, a clinician who can review the basis, and a payer's specific reason all ask to show what an AI used and when. A source on every fact and two time axes can help a product show that. Whether it meets a given rule depends on the whole product.
- **Source attributes are leaving ONC certification (A6).** After 2026-12-28 they are not a current US certification requirement; the feedback export stays.
- **FHIR mapping (F1 to F9).** Four traps for the import: the inclusive end, the source system's dates, `refuted` as a judgement, and imprecise onsets. A FHIR server need not keep versions, and search sees only the current version, so a derived memory with known-at answers adds something FHIR does not guarantee.

## Open questions

- **unverified**: HHS guidance on HIPAA, including on cloud and AI vendors as business associates. `hhs.gov` returned HTTP 403.
- **unverified**: the other changes in the Privacy Rule of 2026-11-19 (H9). Only the access timing and two definitions were read.
- **unverified**: whether the 2011 access-report proposal was formally withdrawn (H5).
- **unverified**: whether Regulation (EU) 2026/1744 changed Arts. 12 to 14, and the consolidated text of Regulation (EU) 2024/1689.
- **unverified**: which FHIR version 45 CFR 170.215 requires, and whether real FHIR servers support `_at`.
- **unverified**: the Medicaid, CHIP and Exchange sections of the prior authorisation rule, and 21 CFR 11.70 and Part 820, which were not read again.
- Legal questions that need professional advice: whether a derived memory is a designated record set, and whether purge meets "return or destroy" or a GDPR erasure request (Q-64).
