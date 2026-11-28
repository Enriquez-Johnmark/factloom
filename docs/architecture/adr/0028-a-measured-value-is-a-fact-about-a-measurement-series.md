# A measured value is a fact about a measurement series, with a unit beside its value

Status: proposed.

A measured value, such as one HbA1c result, is a fact whose subject is the series of that measurement for one patient: an entity of type `measurement`, named by the patient's reference and the test's code, such as `Patient/invented-a LOINC 4548-4`. Its predicate is `measured_as`, single-valued. Its object is the value, as the source writes it, with the unit in a new nullable column, `fact.object_unit`. Its valid time is the time the result describes: the span that `effective[x]` names, read as FHIR dates are read in FL-092, so a result dated to a day holds for that day and one dated to an instant for that millisecond. One further fact, `measurement_of`, links the series to the patient, so that the patient's facts reach it through the graph.

A later version of the same Observation is matched by its source, the locator `Observation/<id>`, not by its value. A `corrected` version is a correction: the earlier value was wrong. Under `human_approval` it is a proposal (FL-090).

The unit is the UCUM code where the Quantity's system is UCUM (`http://unitsofmeasure.org`), and its `unit` text otherwise. Two facts with the same value and different units are different objects. A purge clears the unit with the value, because a unit given as text can hold anything.

## Why

- **The test must be part of the fact.** Results of one test arrive over time for one patient. With the patient as subject and a value as object, nothing in the fact would say which test a value belongs to, and every result of every test would share one subject and predicate.
- **The series as subject keeps the conflict key unchanged.** Two results of one test at overlapping times with different values conflict by the rule of [ADR 0010](0010-conflicts-are-keyed-by-subject-and-predicate.md), with no qualifier in the key. Results at different times do not overlap and do not conflict.
- **The unit is structured where it enters.** R4 gives value, unit, system and code apart ([`healthcare-rules.md`](../../research/industries/healthcare-rules.md), F7). Joined into the value's text, a unit could not be told apart again without parsing. A nullable column is additive: existing facts have none, and their meaning does not change.
- **Matching by source is what a FHIR record means.** A corrected Observation is the same resource with a new value; matching it by value would record a second result instead of correcting the first.

## Alternatives rejected

- **The patient as subject, with the test in a qualifier column in the conflict key.** It changes the conflict key in `core` and in both stores' single-value rule, the deepest rule of the design, where the series entity gives the same behaviour with no change to it. Reconsidered when a domain needs a qualifier with no natural entity to carry it, such as a figure per fiscal period.
- **The unit in the value's text, such as "6.8 %".** No schema change, but the unit could not be read apart, and the same value in two units could not be told from a different value.
- **A predicate per test, such as `has_hba1c`.** A domain's predicates are a fixed list; the tests are thousands of codes.

## Consequences

- One migration adds `fact.object_unit`, and replaces the triggers that keep fact rows unchanged and define purge, so that they name the new column (FL-099). The Postgres store has the same nullable column.
- A question about now asks about a moment, and a result holds only for the time it describes. "The latest result as of a date" is a read of the series' history, not an as-of question; the import and the demo read it that way.
- The patient's own facts do not list results directly; `measurement_of` connects them, and a reader asks for a series by its name.
- Arithmetic on values and unit conversion are not part of this decision.
