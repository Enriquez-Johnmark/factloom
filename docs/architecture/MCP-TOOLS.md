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
| `FACTLOOM_NAMESPACE` | The namespace every tool call uses | None. Required |
| `ANTHROPIC_API_KEY` | Key for extraction. Needed only by `remember` | none |

`FACTLOOM_NAMESPACE` has no default. The server refuses to start without it and says why: the default database is one file per user, so a shared default namespace would mix the memory of every repository that user works in.

How each host passes its working directory to a server, and so whether the namespace could be derived from the repository, is not verified. It stays explicit until it is ([open questions](../research/OPEN-QUESTIONS.md)).

Each host session starts its own server process, so several processes can have the same database file open. The settings that make this safe are under "Connection settings" in [`SCHEMA.md`](SCHEMA.md).

## Subscriptions and API keys

Two different things can need a key, and they are easy to confuse.

- **The coding agent.** Claude Code and Codex each run on either a subscription or an API key. That is between the user and the agent's provider. Factloom is a local MCP server that the agent starts, so how the agent is paid for should make no difference to registering or calling it. This has not been run in each set-up yet; the registration guide records the result for each one ([open questions](../research/OPEN-QUESTIONS.md), Q-79).
- **Factloom's own LLM call.** Only `remember` makes one, to extract facts from free text. It needs `ANTHROPIC_API_KEY`. The design assumes a subscription cannot be used for it; that assumption is not yet verified (Q-80).

So a user with a subscription and no API key can use everything except `remember`. The agent is already a language model: it reads the conversation, works out the facts, and records each one with `record_fact`, which makes no LLM call. The server's instructions tell the agent to do this, and `remember` answers `llm_failed` with the same advice when no key is set.

| Tool | Needs a key of Factloom's own |
|---|---|
| `recall`, `record_fact`, `invalidate_fact`, `get_fact_history` | No |
| `remember` | Yes, `ANTHROPIC_API_KEY` |

Extraction through another provider's key, such as OpenAI's, is not planned for phase 1. The LLM sits behind an interface, so a second provider can be added when someone needs it.

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

Wherever a tool takes a date it accepts either a full UTC timestamp, `2026-03-15T09:30:00.000Z`, or a calendar date, `2026-03-15`, which means 00:00 UTC of that day. Anything else is `invalid_input`. Tools return full timestamps.

A fact that began later on that day is not yet valid at that instant, and the day is the UTC day, not the developer's local day.

### `recall`

Use case: `recall`.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `question` | string, 1 to 2,000 characters | Yes | What to look for, in natural language |
| `as_of` | date | No | Return what was true in the world on this date. Default: the `known_at` date if one is given, otherwise now |
| `known_at` | date | No | Return what Factloom believed on this date. Default: now |
| `limit` | integer, 1 to 50 | No | Most facts to return. Default: 10 |

Output: `{ facts: RecalledFact[] }`, best match first.

| `as_of` | `known_at` | The question it answers |
|---|---|---|
| absent | absent | What is true now. Every fact returned is a **current fact** |
| given | absent | What was true on that date, as Factloom believes today |
| absent | given | What Factloom believed was true on that date. `as_of` takes the same date |
| given | given | What Factloom believed on `known_at` about what was true on `as_of` |

A fact whose text gave no date has an unknown `valid_from`. It is therefore returned for any earlier `as_of` date, however early.

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
  invalidated_at: string | null;
  superseded_by_fact_id: string | null;
  score: number;
  sources: { kind: string; locator: string | null; version: string | null; observed_at: string }[];
};
```

`recorded_at` is the fact's `created_at`. `invalidated_at` and `superseded_by_fact_id` are `null` unless a past `known_at` was given: a fact that Factloom believed then may have been withdrawn since, and these two fields say so.

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

Output: `{ facts: RecordedFact[], skipped: SkippedFact[] }`. A text with nothing worth remembering returns two empty lists.

```ts
type RecordedFact = {
  fact_id: string;
  statement: string;
  valid_from: string | null;
  valid_to: string | null;
  outcome: 'recorded' | 'restated';
};

type SkippedFact = {
  statement: string;
  reason: 'conflicts_with_stored_fact' | 'conflicts_within_text';
  conflicting_fact_ids: string[];
};
```

In phase 1 `remember` does not judge conflicts. It applies two deterministic rules to each extracted fact.

- **Restatement.** A fact with the same subject, predicate and object as a live fact is not recorded again. The new source is attached to the existing fact, which is returned with `outcome: "restated"`.
- **Single-value rule.** For a single-valued predicate, a fact whose valid period overlaps that of a live fact with a different object is not recorded. It is returned in `skipped` with `reason: "conflicts_with_stored_fact"` and the identifiers of the facts in the way. Two facts from the same text that would overlap each other are both skipped, with `reason: "conflicts_within_text"` and an empty `conflicting_fact_ids`, because neither has an identifier.

The agent then decides, and calls `invalidate_fact` with a replacement if the stored fact should give way. Phase 2 replaces the second rule with conflict detection and the domain's correction policy.

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

Output: `{ fact: RecordedFact }`. The restatement rule of `remember` applies: a fact that is already live gains the source and is returned with `outcome: "restated"`. A fact that breaks the single-value rule is not skipped: the call fails with `conflict`.

An unknown entity type or predicate is `invalid_input`, and the message lists the allowed values.

### `invalidate_fact`

Use case: `changeFact`, which calls the core operation `invalidateFact` or `endFact` and makes one commit either way. One tool, because an agent thinks "this fact is no longer right" before it thinks about which time axis is involved. The `because` field carries that distinction.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `fact_id` | string | Yes | The fact, as returned by `recall` |
| `because` | `"was_wrong"` or `"no_longer_true"` | Yes | Whether the fact was never true, or was true and has stopped being true |
| `reason` | string, 1 to 1,000 characters | Yes | Why, in the agent's words. Stored as the content of a source of kind `agent_note`, not in the audit log |
| `ended_at` | date | No | With `no_longer_true`: when it stopped being true. Default: now |
| `replacement` | the inputs of `record_fact`, without `source` | No | The fact that takes its place |

| `because` | `replacement` | Result |
|---|---|---|
| `was_wrong` | given | **Correction**. The replacement takes the valid period of the fact it corrects unless it gives its own |
| `was_wrong` | absent | **Retraction** |
| `no_longer_true` | given | **Succession**. The replacement's `valid_from` defaults to `ended_at` |
| `no_longer_true` | absent | **Revision** that ends the fact |

The source that holds `reason` is the source of the replacement and of the ended copy, and the audit entries point to it with the reason code `reported_wrong` or `reported_ended`. The audit log itself holds no free text, so a later **purge** can remove the sentence.

Output: `{ invalidated_fact_id, replacement_fact_id }`, where `replacement_fact_id` is the new fact or `null`.

A fact's identifier changes when the fact is revised. A caller that holds the old identifier gets `already_invalidated`, with the identifier of the superseding fact.

Nothing is deleted by this tool. Its annotations therefore say it is not destructive, and its description says the fact stays on record.

### `get_fact_history`

Use case: `getFactHistory`.

| Input | Type | Required | Meaning |
|---|---|---|---|
| `fact_id` | string | Yes | Any fact, current or not |

Output: `{ entries: HistoryEntry[] }`, ordered by valid time and then by recorded time. The entries are the facts linked to the given fact by supersession, followed in both directions. For a single-valued predicate they also include every other fact for the same subject and predicate, which is the whole timeline of that value.

Each entry is a `RecalledFact` without `score`, plus `changes`, a list of `{ operation, action, trigger, reason_code, explanation, occurred_at }`, where `explanation` is the content of the source that explains the change, or `null` if there is none or it was purged, taken from the audit log. The explanation of a change is the content of the source that `source_id` names.

## Secrets

`remember`, `record_fact` and `invalidate_fact` refuse input that contains a recognisable secret, such as an API key or a private key block. The check is a fixed list of patterns and runs before anything is stored or sent to the LLM. The result is `invalid_input`, and the message names the kind of secret found without repeating it. A pattern list cannot catch every secret; content that slips through is removed with a purge, which is phase 2. See [ADR 0019](adr/0019-writes-containing-a-secret-are-refused.md).

## Errors

A failure the agent can act on is returned as a normal tool result with `isError: true` and a text message. The message starts with the error code from the shared list in [`INTERFACES.md`](INTERFACES.md), then says what went wrong and what to try.

| Code | When | Tools |
|---|---|---|
| `invalid_input` | A field fails its schema, a date is malformed, or an entity type or predicate is not in the domain | All |
| `not_found` | `fact_id` does not exist in the namespace | `invalidate_fact`, `get_fact_history` |
| `already_invalidated` | The fact is no longer live. The message gives the identifier of the fact that superseded it, if there is one | `invalidate_fact` |
| `already_exists` | An entity with that name and type, or a row with that identifier, was created by another process between the lookup and the commit. Calling the tool again succeeds | `remember`, `record_fact`, `invalidate_fact` |
| `conflict` | The single-value rule: a live fact for the same subject and single-valued predicate overlaps the new fact in valid time. The message gives the identifiers of the overlapping facts. `remember` reports a conflict it finds before writing in `skipped`, not as an error | `remember`, `record_fact`, `invalidate_fact` |
| `embedding_model_mismatch` | The database was built with a different embedding model | All |
| `storage_failed` | The database could not complete the operation | All |
| `llm_failed` | The extraction call failed or returned output that did not match the schema, or no API key is configured. The message suggests `record_fact` | `remember` |
| `embedding_failed` | The embedder could not produce vectors | `recall`, `remember`, `record_fact`, `invalidate_fact` |

These are the nine codes of the shared list, and each has one meaning. `conflict` means only the single-value rule; a duplicate entity or identifier is `already_exists`.

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
