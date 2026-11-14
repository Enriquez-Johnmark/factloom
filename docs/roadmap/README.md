# Roadmap guide

How to read the roadmap, how to implement a work item, and how to keep the roadmap true. The roadmap is the issue tracker for this repository ([`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)); there are no GitHub issues.

## Layout

| File | Holds |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | The index: every epic and work item with its phase, dependencies and status |
| `epics/EPIC-NN.md` | One epic: its outcome, scope and boundaries, and the full specification of each of its work items |
| [`../product/PRODUCT.md`](../product/PRODUCT.md) | What the product is for and what each phase must demonstrate |
| [`../product/REQUIREMENTS.md`](../product/REQUIREMENTS.md) | The requirements, `REQ-01` to `REQ-36` |
| [`../product/CAPABILITIES.md`](../product/CAPABILITIES.md) | The capabilities, with the requirements each satisfies and the epic that owns it |

The roadmap carries no dates, estimates or effort sizes. Order comes from phases and dependencies only.

## Identifiers

- An epic is `EPIC-NN` and a work item is `FL-NNN`.
- An identifier is permanent. It is never changed, and never reused for something else, also after the item is retired.
- Numbers inside an epic need not be consecutive. Identifiers were assigned in epic order with later additions, so EPIC-05 holds FL-026, FL-030 to FL-033 and FL-057. Do not renumber to tidy this.
- A new work item takes the next unused number, whichever epic it joins. FL-066 was added to EPIC-07 this way.
- A work item that turns out to be too large is split by keeping its identifier for the first part and giving new identifiers to the rest. FL-056 to FL-065 and FL-067 to FL-073 came from such splits: each stands in its epic file directly after the item it was split from, and the first part was given a narrower title.
- The work items are FL-001 to FL-073, with no number unused.

## Status

A status is recorded on the work item in its epic file and mirrored in the index. An epic's status follows its work items: `Completed` when all are, `Pending` otherwise.

| Status | Means | Evidence needed |
|---|---|---|
| `Pending` | Not finished. This includes not started and in progress | None |
| `Blocked` | Cannot proceed until something outside the work item changes | The status line names the blocker: a work-item identifier, an open question such as `Q-01` from [`OPEN-QUESTIONS.md`](../research/OPEN-QUESTIONS.md), or a decision the owner must make |
| `Under Review` | The work is on `main` and `pnpm check` passes, but one or more acceptance criteria still wait for a person: the owner's review, or a step only the owner can run, such as a run on the Apple Silicon machine | The commit, the check output, and a list of the criteria still open |
| `Completed` | Every acceptance criterion is met | The commit on `main`, plus the passing check output or the eval output that the work item's "Completion evidence" field asks for |

`Completed` is never set from a claim alone. If a criterion could not be run, the item is not complete; say which step was skipped and why. A work item whose evidence later turns out to be wrong goes back to `Pending` with a note.

## The work-item template

Every work item in an epic file has these fields, in this order.

| Field | What belongs in it |
|---|---|
| Status | One of the four values above |
| Phase | The delivery phase that needs the item |
| Depends on | Direct prerequisites only, as `FL` identifiers, or `None`. Not everything that happens to come earlier |
| Requirements | The `REQ` identifiers the item helps to deliver |
| Components | The packages or subsystems it touches |
| Objective | One or two sentences: what the item is for |
| Background | The problem or context, with links to the design documents and ADRs that decide it |
| Outcome | What exists when the item is done, from the point of view of the next engineer or the user |
| Scope | What the item builds |
| Non-goals | What is deliberately left out, and which later item covers it |
| Functional requirements | What the result must do, as numbered statements |
| Technical requirements | How it must be built where that is already decided: the interface, the package, the rule it must respect |
| Constraints | The architectural rules that apply, by link |
| Acceptance criteria | Check boxes. Each is checkable by running something: a named test that passes, a command with an expected result, a query with an expected answer. Where a person is needed, exactly what they run and what they record |
| Validation | Which tests and commands prove it: unit, contract, smoke or eval |
| Completion evidence | What is recorded when the item is done: the commit, the check output, the eval numbers |

Epics 10 to 12 describe phases 4 to 6 and have no work items yet. Each has an "Open decisions" section listing what must be decided before its work items can be written. EPIC-05 and EPIC-09 also have a short "Open decisions" section, for a choice that is deliberately not made yet and the measurement that would reopen it.

Evals are not a package. The scenario files, the extraction cases, the recordings, the record-and-replay wrapper, the scenario runner, the retrieval eval and the benchmark live in `apps/mcp-server/evals/` ([`TESTING.md`](../architecture/TESTING.md), "Layer B").

## Implementing a work item

1. Pick a `Pending` item whose dependencies are all `Completed`. Read its section, then the documents its Background and Constraints link to.
2. Implement it in one focused session. If it does not fit, stop and split it as described under "Identifiers"; do not leave half of it on `main`.
3. Run `pnpm check`. It must pass before the commit. It needs no network, no API key and no embedding model. If the item adds or changes a test that needs the real embedding model, also run `pnpm eval`, which runs those tests ([`TESTING.md`](../architecture/TESTING.md), "Four kinds of test").
4. Tick the acceptance criteria that were run, fill in the completion evidence, and set the status, in the epic file and in [`ROADMAP.md`](ROADMAP.md). These edits go in the same commit as the work, so that the roadmap never disagrees with the code.
5. Follow [`.claude/rules/git.md`](../../.claude/rules/git.md) for the commit itself.

Some items need LLM recordings that only the owner can make, with a real API key: FL-069, FL-039, FL-041, FL-042, FL-051 and FL-064. A replayed run fails while a recording is missing, so such an item is done in a session with the owner present. The agent writes the code, the owner runs the record command the item names, and the code and the recordings are committed together once `pnpm check` passes. Nothing of the item is committed before that step.

If the work shows that a design document is wrong, correct the document in its own commit, and add an ADR when a decision changes. Do not change an identifier, a phase or a dependency silently; say why in the commit message.

## Traceability

Every requirement can be followed to the evidence that it is met, and back.

```
requirement ─► capability ─► epic ─► work item ─► implementation reference ─► acceptance criteria ─► validation evidence
REQUIREMENTS    CAPABILITIES   epics/   epics/        the package and the          the work item        the commit and the
                                                      use case or operation                             check or eval output
```

A worked example, for REQ-04. Nothing in it is implemented yet; it shows where each link is written down.

| Link | For REQ-04 | Where it is recorded |
|---|---|---|
| Requirement | Recall answers "what was true on a date" and "what was believed on a date", in every retrieval lane | [`REQUIREMENTS.md`](../product/REQUIREMENTS.md) |
| Capability | Answer as-of and known-at questions | [`CAPABILITIES.md`](../product/CAPABILITIES.md) |
| Epics | EPIC-03 for the time filter in storage, EPIC-05 for the use case, EPIC-06 for the tool | The "Requirements" row of each epic's header |
| Work items | FL-012 (the contract suite's time cases), FL-067 (its lane cases), FL-015, FL-016 and FL-017 (structural reads and the two lanes in SQLite), FL-031 (the `recall` use case and its date defaults), FL-056 (the two lanes of the in-memory store), FL-058 (the `recall` tool with `as_of` and `known_at`) | The "Requirements" row of each work item |
| Implementation reference | The time predicate in `@factloom/storage`; the use case `recall` in `@factloom/graph-rag`; the tool `recall` in `apps/mcp-server` | "Components" in the work item, following "Where to find things" in [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) |
| Acceptance criteria | For example, the contract suite's cases for every row of the time table and for "each retrieval lane returns no fact outside the time filter" ([`TESTING.md`](../architecture/TESTING.md)) pass against the SQLite adapter | The check boxes of FL-012, FL-067, FL-015, FL-016 and FL-017 |
| Validation evidence | The commit and the `pnpm check` output that shows those cases passing | "Completion evidence" in each work item |

To check a requirement, start from its row in `REQUIREMENTS.md` and read the status and evidence of each work item listed there. A requirement is met when all of them are `Completed`.

## Keeping the roadmap true

- A new work item is written into its epic file with the full template, added to the table at the top of that epic's "Work items" section, and added to the index, in the same commit. If it delivers a requirement, add its identifier to that requirement's row in `REQUIREMENTS.md`: a work item is listed there exactly when its "Requirements" row names the requirement.
- A new requirement takes the next `REQ` number and is added to `REQUIREMENTS.md` and to a capability in `CAPABILITIES.md`.
- Anything not yet verified stays in [`OPEN-QUESTIONS.md`](../research/OPEN-QUESTIONS.md) and is not written as fact in a work item.

## Retired items

A work item or epic that will not be built is retired, not deleted. Its section is moved to `retired.md`, next to this guide, with one line saying why and what replaces it, if anything. Its row is removed from the index, because the four status values have no "retired". Its identifier is not reused.

`retired.md` does not exist now, because nothing has been retired. Create it only when the first item is retired.
