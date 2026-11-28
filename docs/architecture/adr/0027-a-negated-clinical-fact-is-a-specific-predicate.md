# A negated clinical fact is a specific predicate

Status: accepted, by the owner on 2026-11-28.

A statement that something is not so is recorded as an ordinary fact with a predicate that says so. In the healthcare domain: `ruled_out` (a patient, a condition) for a Condition whose verification status is `refuted`; `not_allergic_to` (a patient, a substance) for a refuted AllergyIntolerance; and `not_taking` (a patient, a medication) for a MedicationStatement whose status is `not-taken`. Facts gain no negation flag, and `core` and the storage adapters do not change. Which predicates are opposites is a list in the healthcare adapter.

When a statement arrives for a patient and a thing whose opposite is a live fact, the earlier fact was wrong, or the world changed, and only a clinician can say which. The import therefore stores a correction proposal, with the new statement as its replacement, and the clinician approves or rejects it. Under `human_approval` this is a proposal like any other (FL-090).

Valid time is what the record gives: `effective[x]` for a medication not taken; for a refuted condition or allergy, R4 gives no period of the ruling-out, so the start is the record's `recordedDate` where given and unknown otherwise, with no end.

## Why

- **`refuted` and `not-taken` are clinical statements, not errors.** R4 says `refuted` means "ruled out by diagnostic and clinical evidence", unlike `entered-in-error`, which says the record "should never have existed" ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), F5, F6). Invalidating a fact loses the statement, and records nothing when no positive fact was ever stored.
- **A flag would change what every fact means.** With a `negated` column, every read, every conflict check, every restatement, every retrieval lane and every history would have to read it, or a negated fact would be read as a positive one. A missed reading is silent, and in healthcare it reverses a clinical meaning. A new predicate cannot be misread that way: a reader that does not know it simply does not ask for it.
- **ADR 0010 already prefers specific predicates.** Conflicts are keyed by subject and predicate, and a specific predicate is the design's way to say more ([ADR 0010](0010-conflicts-are-keyed-by-subject-and-predicate.md)).

## Alternatives rejected

- **A `negated` column on the fact.** For the reasons above; it is also a migration of every fact row's meaning, which the first schema's rule forbids ([`other-industries.md`](../../research/industries/other-industries.md), "What must be in the first schema").
- **Negation in the object, such as a value "not asthma".** The object would no longer name the condition, so entity resolution and the graph lane could not connect it.
- **A lower confidence.** Confidence is how much the record is believed, not what it says. A refuted condition is believed with confidence: it was ruled out.
- **Retracting the positive fact only.** It keeps no record that the condition was ruled out, which is what a later reader needs to know.

## Consequences

- Conflict detection in `core` does not see that `has_condition` and `ruled_out` are opposites. The FHIR import checks the pairs itself. A note given to `remember` under the healthcare domain could record both without a conflict; extraction from notes is not built for healthcare, and this is the first thing it must handle.
- Recall returns a negated fact by its own statement, such as "Invented Patient A: asthma ruled out", so a reader sees it as a negation.
- Each further negation in a domain is a further predicate. That list is short in the records read so far.
