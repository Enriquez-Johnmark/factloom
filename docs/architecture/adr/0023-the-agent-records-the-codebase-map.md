# The agent records the code base map as it explores

Status: accepted

The map of FL-082, where things are in a repository and what each part does, reaches Factloom the way any other fact does: the coding agent records it with `record_fact` as it finds its way around, told so by the server's instructions. Each map fact uses the predicate `defined_in`: a symbol is defined in a file, given as a value, one file at a time. Its statement says what the symbol does, so one fact answers both where and what. Its source is the file, of kind `file`; when the agent gives no commit, the server records the repository's `HEAD` as the source's version, so that the verification of FL-050 checks the fact against the file and the repair of FL-054 follows a rename.

## Why

- **The agent already reads the files.** Finding its way, it opens the files that matter to a task; recording what it found costs one tool call, and no model call of Factloom's own. A fact enters memory only from something the agent actually read.
- **The map grows where work happens.** Files nobody touches get no map facts, and the facts that exist are the ones a later task in the same area is likely to need.
- **Maintenance needs a file at a commit.** Verification and repair read a fact's anchor: a source of kind `file` with a locator and a version ([`find-anchor.ts`](../../../packages/maintenance/src/find-anchor.ts)). An agent rarely knows the commit without a `git` call, a turn of its own; the server knows the repository and fills it in.
- **One predicate keeps the map maintainable.** The path is the object, a value, so a rename is a change of value: the repair can end the fact and continue it at the new path, a succession, as FL-062 does for a version. A path kept only in free text could not be repaired.

## Alternatives rejected

- **A command that seeds the map from the repository, without an LLM.** It can list each file's exported names, which is what `grep` already gives the agent in one call. The facts that save turns, what a part of the code is for, are not in a list of names.
- **A command that seeds the map with an LLM summarising each file.** It would spend tokens before any session, which the agent's usage output does not show, so the comparison of FL-082 could not count them. It would also write facts about files no task needs.
- **A file as an entity, named by its path.** A rename would leave the entity's name wrong, and entities are never updated ([`data.md`](../../../.claude/rules/data.md)).
- **No new predicate: `described_as` with the path in the statement.** The repair could not change the path without rewriting free text.

## Consequences

- The map is only as complete as the agent's recording. FL-082's comparison measures that, as the agent behaves, not as a seeded map would.
- `defined_in` changes the extraction instructions, so the extraction, scenario and judge recordings are made again.
- A map fact whose file changed is `inconclusive`, not wrong: an edit to a file rarely moves a function. It is `contradicted` when the symbol it names is no longer in the file (FL-071), and the recall hook then leaves it out.
