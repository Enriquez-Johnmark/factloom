# Conflicts are keyed by subject and predicate, with specific predicates

Status: accepted

Two facts can conflict only if they have the same subject and the same predicate, and only if the domain marks that predicate single-valued. There is no further qualifier in the key. Where one subject can hold several values of a kind at once, the predicate is made specific: `uses_test_framework` and `uses_lint_tool`, not `uses` with a role.

A key that is too broad is a known failure: one system studied superseded an unrelated fact because its rule was "same entity and category, different text" ([evaluation](../../research/evaluations/memwright.md)). A narrow, explicit key avoids that, and keeps candidate selection a plain indexed lookup with no LLM.

## Considered options

- **Add a qualifier column to the key**, for cases such as a figure per fiscal period. Rejected for now: nothing in the software development domain needs it, a period is often what valid time already expresses, and it can be added as a nullable column when a domain proves the need.
- **Select candidates by embedding similarity.** Rejected as the primary key: similar wording is not the same claim. It may be added in phase 2 as a second source of candidates if the eval set shows conflicts being missed.

## Consequences

Predicates must be designed with care, and a domain with many of them gets a long list. The first domain starts with the few predicates its eval scenarios use.
