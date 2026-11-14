# Conflicts are keyed by subject and predicate, with specific predicates

Status: accepted

Two facts can conflict only if they have the same subject and the same predicate, and only if the domain marks that predicate single-valued. They conflict when both are live, their objects differ and their valid periods overlap. A missing bound counts as open, and periods that only touch do not overlap. Whether either fact is current does not matter. There is no further qualifier in the key. Where one subject can hold several values of a kind at once, the predicate is made specific: `uses_test_framework` and `uses_lint_tool`, not `uses` with a role.

A key that is too broad is a known failure: one system studied superseded an unrelated fact because its rule was "same entity and category, different text" ([evaluation](../../research/evaluations/memwright.md)). A narrow, explicit key avoids that, and keeps candidate selection a plain indexed lookup with no LLM.

## Considered options

- **Add a qualifier column to the key**, for cases such as a figure per fiscal period. Rejected for now: nothing in the software development domain needs it, a period is often what valid time already expresses, and it can be added as a nullable column when a domain proves the need.
- **Select candidates by embedding similarity.** Rejected as the primary key: similar wording is not the same claim. It may be added in phase 2 as a second source of candidates if the eval set shows conflicts being missed.

## Consequences

- Predicates must be designed with care, and a domain with many of them gets a long list. The first domain starts with the few predicates its eval scenarios use.
- An accepted limitation: the key includes the subject entity, and an entity is unique by type and name. The same thing extracted with two different entity types becomes two entities, and the two can hold contradictory facts until an entity merge in phase 3. Extraction limits how often this happens in two ways. The extraction schema lists the domain's entity types as a closed list. And entity resolution prefers an existing entity of any type when exactly one has that name.
