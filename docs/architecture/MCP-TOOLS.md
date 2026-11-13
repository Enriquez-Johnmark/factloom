# MCP tool surface

The tools the phase 1 MCP server exposes to Claude Code and Codex. This is a design; nothing is implemented.

Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). What is known about the MCP SDK and the two hosts is in the [MCP research](../research/technical/mcp.md).

## Shape of the server

- **Transport:** stdio, started by the host as a local process. Only protocol messages go to standard output; all logging goes to standard error.
- **Scope:** tools only. No resources and no prompts in phase 1.
- **State:** none between calls. Every call carries what it needs, including its dates.
- **Namespace:** set when the server starts, from configuration. Tools do not take a namespace, so an agent cannot read or write the wrong one by mistake.
- **Instructions:** the server sets a short `instructions` string, because Claude Code loads only tool names and server instructions at session start and fetches full tool definitions later. The text says what the memory holds and when to use it, with the important words first, and stays well under the 4,096 characters Claude Code keeps.

Configuration, read from environment variables by the composition root:

| Variable | Meaning | Default |
|---|---|---|
| `FACTLOOM_DB` | Path of the SQLite file | `~/.factloom/factloom.db` |
| `FACTLOOM_NAMESPACE` | The namespace every tool call uses | `default` |
| `ANTHROPIC_API_KEY` | Key for extraction. Needed only by `remember` | none |

How each host passes its working directory to a server, and so whether the namespace could be derived from the repository, is not verified. It stays explicit until it is ([open questions](../research/OPEN-QUESTIONS.md)).

## Tools

Five tools, in this order. Every input field has a description in its schema. Every tool declares an output schema and returns the same JSON both as `structuredContent` and as text.

| Tool | Does | Calls an LLM | Read-only |
|---|---|---|---|
| `recall` | Finds the facts that answer a question | No | Yes |
| `remember` | Extracts facts from text and records them | Yes | No |
| `record_fact` | Records one fact that is already structured | No | No |
| `invalidate_fact` | Says a fact is wrong or no longer true | No | No |
| `get_fact_history` | Shows how a fact changed and why | No | Yes |

`recall` is first because it is the tool an agent should reach for most.

### Dates

Wherever a tool takes a date it accepts either a full UTC timestamp, `2026-03-15T09:30:00.000Z`, or a calendar date, `2026-03-15`, which means the start of that day in UTC. Anything else is `invalid_input`. Tools return full timestamps.

### `recall`

Use case: `recall`.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `question` | string, 1 to 2,000 characters | Yes | What to look for, in natural language |
| `as_of` | date | No | Return what was true in the world on this date. Default: now |
| `known_at` | date | No | Return what Factloom believed on this date. Default: now |
| `limit` | integer, 1 to 50 | No | Most facts to return. Default: 10 |

Output: `{ facts: RecalledFact[] }`, best match first. With neither date given, every fact returned is a **current fact**.

```ts
type RecalledFact = {
  fact_id: string;
  statement: string;
  subject: { type: string; name: string };
  predicate: string;
  object: { type: string; name: string } | { value: string };
  confidence: number;
  valid_from: string | null;
  valid_to: string | null;
  recorded_at: string;
  score: number;
  sources: { kind: string; locator: string | null; version: string | null; observed_at: string }[];
};
```

An empty list is a normal result, not an error.

### `remember`

Use case: `remember`.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `text` | string, 1 to 20,000 characters | Yes | What to remember, in natural language |
| `source` | object | No | Where it came from. Default: a note from the agent |
| `source.kind` | string | No | For example `agent_note`, `conversation`, `file`. Default: `agent_note` |
| `source.locator` | string | No | A path or URL |
| `source.version` | string | No | For a file in git, the commit |

Output: `{ facts: RecordedFact[], skipped: SkippedFact[] }`. `facts` has one entry per fact recorded, where `RecordedFact` is `{ fact_id, statement, valid_from, valid_to }`. `skipped` has one entry per extracted fact that was not recorded, as `{ statement, reason, conflicting_fact_id }`. A text with nothing worth remembering returns two empty lists.

In phase 1 `remember` does not judge conflicts. It applies one deterministic rule: an extracted fact that would be a second current value for a single-valued predicate is not recorded, and is returned in `skipped` with the identifier of the existing fact. The agent then decides, and calls `invalidate_fact` with a replacement if the stored fact should give way. Phase 2 replaces this rule with conflict detection and the domain's correction policy.

### `record_fact`

Use case: `recordStructuredFacts`. For a caller that already knows the subject, predicate and object. It makes no LLM call and needs no API key.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `subject` | `{ type, name }` | Yes | The entity the fact is about. Created if it does not exist |
| `predicate` | string | Yes | One of the domain's predicates |
| `object` | `{ type, name }` or `{ value }` | Yes | Another entity, or a literal value |
| `statement` | string | Yes | The fact as one sentence |
| `valid_from` | date | No | When it became true. Default: unknown |
| `valid_to` | date | No | When it stopped being true. Default: no known end |
| `confidence` | number, 0 to 1 | No | Default: 1 |
| `source` | object | No | As for `remember` |

Output: `{ fact: RecordedFact }`.

An unknown entity type or predicate is `invalid_input`, and the message lists the allowed values.

### `invalidate_fact`

Use cases: `invalidateFact` and `endFact`. One tool, because an agent thinks "this fact is no longer right" before it thinks about which time axis is involved. The `because` field carries that distinction.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `fact_id` | string | Yes | The fact, as returned by `recall` |
| `because` | `"was_wrong"` or `"no_longer_true"` | Yes | Whether the fact was never true, or was true and has stopped being true |
| `reason` | string, 1 to 1,000 characters | Yes | Why. Stored in the audit log |
| `ended_at` | date | No | With `no_longer_true`: when it stopped being true. Default: now |
| `replacement` | the inputs of `record_fact` | No | The fact that takes its place |

| `because` | `replacement` | Result |
|---|---|---|
| `was_wrong` | given | **Correction** |
| `was_wrong` | absent | **Retraction** |
| `no_longer_true` | given | **Succession**. The replacement's `valid_from` defaults to `ended_at` |
| `no_longer_true` | absent | **Revision** that ends the fact |

Output: `{ invalidated_fact_id, replacement_fact_id }`, where `replacement_fact_id` is the new fact or `null`.

Nothing is deleted by this tool. Its annotations therefore say it is not destructive, and its description says the fact stays on record.

### `get_fact_history`

Use case: `getFactHistory`.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `fact_id` | string | Yes | Any fact, current or not |

Output: `{ entries: HistoryEntry[] }`, oldest first: every fact ever recorded for the same subject and predicate. Each entry is a `RecalledFact` without `score`, plus `invalidated_at`, `superseded_by_fact_id`, and `changes`, a list of `{ operation, action, trigger, reason, occurred_at }` taken from the audit log.

## Errors

A failure the agent can act on is returned as a normal tool result with `isError: true` and a text message. The message starts with the error code from the shared list in [`INTERFACES.md`](INTERFACES.md), then says what went wrong and what to try.

| Code | When | Tools |
|---|---|---|
| `invalid_input` | A field fails its schema, a date is malformed, or an entity type or predicate is not in the domain | All |
| `not_found` | `fact_id` does not exist in the namespace | `invalidate_fact`, `get_fact_history` |
| `already_invalidated` | The fact has already been invalidated. The message gives the identifier of the fact that superseded it, if there is one | `invalidate_fact` |
| `conflict` | The fact would be a second current value for a single-valued predicate. The message gives the identifier of the existing fact. `remember` reports the same situation in `skipped`, not as an error | `record_fact`, `invalidate_fact` |
| `llm_failed` | The extraction call failed, or no API key is configured. The message suggests `record_fact` | `remember` |
| `embedding_failed` | The embedder could not run | `recall`, `remember`, `record_fact`, `invalidate_fact` |
| `embedding_model_mismatch` | The database was built with a different embedding model | All |
| `storage_failed` | The database could not complete the operation | All |

Input that fails the tool's own schema is rejected by the SDK before the handler runs, with its own message. Protocol errors are left to the SDK.

## Annotations

| Tool | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
|---|---|---|---|---|
| `recall` | true | | | false |
| `remember` | false | false | false | true |
| `record_fact` | false | false | false | false |
| `invalidate_fact` | false | false | false | false |
| `get_fact_history` | true | | | false |

`remember` is open-world because it sends the text to the LLM provider.

## What a handler does

Each handler does three things and nothing else: converts the tool input to the use case's input, calls the use case, and converts the `Result` to a tool result. It contains no rules about facts. The HTTP API in phase 4 will call the same use cases.

## Not in phase 1

- **Conflict detection and automatic resolution inside `remember`.** Phase 2.
- **A feedback tool.** Phase 2.
- **Hooks that call recall at session start.** Useful, because an agent may never call the tools on its own, but optional and later. The server must be useful with no hook installed.
- **Resources, prompts, and an HTTP transport.**
- **A tool to list or merge entities.** Phase 3.
