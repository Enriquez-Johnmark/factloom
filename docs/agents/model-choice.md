# Which model does the work

Kronomind is built with AI assistance, with two kinds of model: an everyday model that follows the written plan, and a stronger, more expensive model for the moments below. The owner chooses the model for each session. This file says when the stronger one is worth it. It names no product, because model names change faster than this advice.

## The everyday model is enough when

The work item is specified down to its tests: its requirements, its acceptance criteria and the names of its tests are in the epic file, and the design it rests on is in `docs/architecture/`. Most of phase 1 is like this: the use cases, the LLM client, the embedder and the MCP tools.

## Bring in the stronger model when

| When | Why |
|---|---|
| A phase ends | An independent review of everything built in the phase, before anything relies on it. The reviewer reads the code and the evidence blocks without being told what to conclude |
| The plan did not foresee something | A work item whose requirements contradict each other, or a finding that would change a document in `docs/architecture/` or a decision record |
| A bug survives two attempts | Stop after the second failed fix. Hand over what was tried and what was observed |
| A phase with design in it begins | Phase 2 starts with the conflict judge (FL-041) and the purge design (FL-047). Both are decisions, not only implementation |
| A measurement has to be interpreted | The retrieval eval (FL-033, FL-057), the benchmark (FL-066) and the token comparison (FL-074) each end in a judgement about what to change |
| A schema migration after the first is written | A released migration is never edited, so a mistake in one is permanent |

## The signal to watch

Every completed work item has a "Recorded evidence" block that says what differs from the work item as written. A short list of small differences is normal. A long list, a difference that touches a rule in `.claude/rules/`, or a test that was changed to pass is the signal to have the stronger model look again before the next item starts.

## What does not change with the model

The rules in `.claude/rules/`, the order of steps in [`issue-tracker.md`](issue-tracker.md), commit signing as in [`commit-signing.md`](commit-signing.md), and the rule that nothing unverified is written as fact.
