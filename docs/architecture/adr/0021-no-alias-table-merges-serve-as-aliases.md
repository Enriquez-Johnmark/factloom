# No alias table: merges serve as aliases

Status: accepted

Factloom has no `entity_alias` table. When two names are found to be one thing, the duplicate detection of FL-053 merges the two entities, and the merge is what makes either name find the same facts.

## Why

The [entity resolution research](../research/technical/entity-resolution.md) proposes aliases as rows, so that its stage 2, "normalised name equals a stored alias of exactly one entity", is an indexed lookup. FL-053 asked for a use of such a table that merge resolution (FL-052, FL-063) does not already serve. None was found:

- **After a merge, the other name still resolves.** The entity merged from keeps its row and its name. Resolution at write time (FL-020) finds it by its exact normalised name. Every read then resolves it to the entity it was merged into, so a fact recorded under "Postgres" is read with the facts of "PostgreSQL". That is what an alias lookup would give.
- **No work item writes an alias.** A stored alias would have to come from somewhere: a person, a manifest, or a model. No item in the roadmap records one. Stage 2 of FL-053 would therefore look up an empty table.
- **A merge can be undone; an alias would need the same.** A wrong alias joins two things as a wrong merge does. `undoEntityMerge` already withdraws a merge, with its audit entry. An alias table would need its own undo and its own audit action for the same effect.

A name that is known to be an alias before any entity carries it would need the table. That is a name nobody has used yet, and none of the planned sources gives one.

## Alternatives rejected

- **Build the table as the research describes it.** It adds a migration, a `Change` kind and an audit action, and it would stay empty. The engineering principles leave out a table without a use.
- **Write an alias at each merge.** It would duplicate the merge row and could drift from it when a merge is undone.

## Consequences

- FL-053 runs one stage, the stricter name match, and passes the pairs it does not decide to the stages FL-064 adds.
- If a source of aliases appears, such as a manifest that names a package by two names, the table is added then, with a new decision record. It is an additive table and forces no rewrite.
- Section C of [`OPEN-QUESTIONS.md`](../research/OPEN-QUESTIONS.md) listed the table as a candidate for deferral. This record settles it.
