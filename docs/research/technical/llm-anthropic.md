# LLM access: the Anthropic API from TypeScript

Accessed: 2026-11-13.

## Question

How should Factloom call Claude for entity/fact extraction, conflict detection and re-verification:
which SDK and models, how to get Zod-validated structured output, what it costs, which cost features
apply, and what a provider-neutral LLM interface in `core` has to cover?

Every finding below was checked on 2026-11-13 against the page or registry named beside it. Labels:
**confirmed** (primary source or run here), **likely** (indirect evidence), **unverified** (listed
under Open questions only).

## Findings

### 1. TypeScript SDK

| Item | Value | Source | Label |
|---|---|---|---|
| Package | `@anthropic-ai/sdk` | https://www.npmjs.com/package/@anthropic-ai/sdk (`npm view`) | confirmed |
| Current version | 1.8.0, published 2026-11-10. Seven minor releases between 2026-10-23 (1.2.0) and 2026-11-10 | `npm view @anthropic-ai/sdk version time` | confirmed |
| Node requirement | "Node.js 20 LTS or later (non-EOL) versions"; also Deno >= 1.28, Bun >= 1.0. The package has no `engines` field, so npm does not enforce this | https://github.com/anthropics/anthropic-sdk-typescript README, "Requirements"; `npm view @anthropic-ai/sdk engines` (empty) | confirmed |
| Zod peer dependency | `zod: ^3.25.0 \|\| ^4.0.0` | `npm view @anthropic-ai/sdk peerDependencies` | confirmed |
| Runtime dependencies | `standardwebhooks`, `json-schema-to-ts`, `@opentelemetry/api` | `npm view @anthropic-ai/sdk dependencies` | confirmed |
| API key | The client reads `ANTHROPIC_API_KEY` by default; a key can be passed as `new Anthropic({ apiKey })` | SDK README; run here with the key passed explicitly from an environment variable | confirmed |

Basic call shape (confirmed by running it, section 4):

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.SOME_KEY });
const res = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 2000,
  system: "…",
  messages: [{ role: "user", content: "…" }],
});
// res.content is an array of typed blocks; res.usage has token counts; res.stop_reason says why it ended
```

The SDK releases often (seven minor versions in three weeks). Pin an exact version and upgrade on
purpose. (confirmed, npm release times)

### 2. Current models, limits and prices

Sources: https://platform.claude.com/docs/en/models/overview (redirect target of
`/docs/en/about-claude/models/overview`), https://platform.claude.com/docs/en/about-claude/pricing and
https://platform.claude.com/docs/en/about-claude/model-deprecations. All **confirmed** by reading
those pages. Prices are USD per million tokens (MTok) on the Anthropic API.

"Latest models" (the four the overview page recommends):

| Model | API model ID | Context | Max output | Input | Output | 5m cache write | 1h cache write | Cache read | Batch input | Batch output |
|---|---|---|---|---|---|---|---|---|---|---|
| Claude Fable 5.2 | `claude-fable-5-2` | 1M | 128K | $8 | $40 | $10 | $16 | $0.20 | $4 | $20 |
| Claude Opus 5.5 | `claude-opus-5-5` | 1M | 128K | $4 | $20 | $5 | $8 | $0.20 | $2 | $10 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 1M | 128K | $2 | $10 | $2.50 | $4 | $0.10 | $1 | $5 |
| Claude Haiku 5.5 (prompt <= 100,000 tokens) | `claude-haiku-5-5` | 1M | 128K | $0.10 | $0.50 | $0.125 | $0.20 | $0.01 | $0.05 | $0.25 |
| Claude Haiku 5.5 (prompt > 100,000 tokens) | `claude-haiku-5-5` | 1M | 128K | $0.50 | $2.50 | $0.625 | $1 | $0.05 | $0.25 | $1.25 |

Other models still listed as **Active** on the deprecations page (older, not in "Latest models"):

| Model | API model ID | Context | Max output | Input | Output | Cache read | Batch in / out |
|---|---|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 1M | 128K | $10 | $50 | $0.25 | $5 / $25 |
| Claude Fable 5 | `claude-fable-5` | 1M | 128K | $10 | $50 | $1 | $5 / $25 |
| Claude Opus 5 | `claude-opus-5` | 1M | 128K | $5 | $25 | $0.50 | $2.50 / $12.50 |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | 128K | $5 | $25 | $0.50 | $2.50 / $12.50 |
| Claude Opus 4.7 | `claude-opus-4-7` | 1M | 128K | $5 | $25 | $0.50 | $2.50 / $12.50 |
| Claude Opus 4.6 | `claude-opus-4-6` | 1M | 128K | $5 | $25 | $0.50 | $2.50 / $12.50 |
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | 200K | 64K | $5 | $25 | $0.50 | $2.50 / $12.50 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 128K | $2 | $10 | $0.20 | $1 / $5 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | 128K | $3 | $15 | $0.30 | $1.50 / $7.50 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | 200K | 64K | $1 | $5 | $0.10 | $0.50 / $2.50 |

Not usable for new work:

| Model | Status | Source |
|---|---|---|
| Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | Deprecated 2026-09-30, retires 2026-11-30 | model-deprecations page |
| `claude-mythos-preview` | Deprecated 2026-06-09 | model-deprecations page |
| Claude Opus 4.1, Opus 4, Sonnet 4, Haiku 3.5, Haiku 3 | Retired on the Anthropic API | model-deprecations page; overview table |
| Claude Mythos 5 / 5.1 / 5.2 | Active but "limited availability" (verified organizations only); same prices as the Fable model of the same number | overview and pricing pages |

Notes, all **confirmed** on the pages above:

- Model IDs from the 4.6 generation on have no date suffix and are pinned snapshots ("Every Claude
  model ID is a pinned snapshot, including the dateless IDs").
- Retirement commitments: Haiku 5.5 "not sooner than October 7, 2027", Sonnet 5.5 "not sooner than
  September 28, 2027", Opus 5.5 "not sooner than September 22, 2027". Haiku 4.5 is active but its
  earliest retirement date (October 15, 2026) has already passed, so it could be given a retirement
  date at any time.
- Cache multipliers: 5-minute write 1.25x base input, 1-hour write 2x, read 0.1x on most models,
  0.05x on Opus 5.5 and Sonnet 5.5, 0.025x on Fable 5.2 / 5.1.
- Batch: "50 percent discount on both input and output tokens."
- Haiku 5.5 is the only current model priced by prompt length: a request whose prompt (including
  cache reads and writes) is over 100,000 tokens pays 5x. Factloom's extraction prompts are far below
  this.
- "Claude 4.7 and later models ... use a newer tokenizer ... approximately 30% more tokens for the
  same text" than Sonnet 4.6 / Haiku 4.5 and earlier. Token estimates carried over from older models
  undercount.
- Haiku 5.5 is described on the overview page as "For high-volume, latency-sensitive tasks such as
  classification, extraction, and routing" and has default effort `medium`; thinking is adaptive.

### 3. Structured output

Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (status: stable).
All **confirmed** unless marked.

- Two features share one grammar pipeline: JSON outputs (`output_config.format` with
  `type: "json_schema"`) and strict tool use (`strict: true` on a tool definition). Both use
  constrained decoding, so the response always parses and matches the schema, except on a refusal
  or when `max_tokens` cuts it off.
- The old top-level `output_format` parameter is deprecated: "The `output_format` parameter has moved
  to `output_config.format`, and beta headers are no longer required." Sending `output_format`
  without the old beta header returns a 400.
- TypeScript helper: `zodOutputFormat(schema)` from `@anthropic-ai/sdk/helpers/zod`, passed as
  `output_config: { format: zodOutputFormat(Schema) }` to `client.messages.parse()`. `parse()`
  validates the response with the original Zod schema and returns it typed as `parsed_output`. There
  is also `jsonSchemaOutputFormat()` for a plain JSON schema without Zod.
- Models: "Structured outputs are available on every model". The page's supported list includes
  `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-2` and the older
  active models.
- Zod 4: the SDK's peer range is `^3.25.0 || ^4.0.0`, and the test in section 4 ran with zod 4.6.7.
- What the helper does to the schema before sending it ("How SDK transformation works"): removes
  unsupported constraints (`minimum`, `maximum`, `minLength`, `maxLength`), copies them into the
  field description, adds `additionalProperties: false` to every object, filters string formats, and
  still validates the response against the original schema client-side. Observed in section 4:
  `z.number().min(0).max(1)` was sent as `{"type":"number","description":"{minimum: 0, maximum: 1}"}`.
  So numeric bounds are a hint to the model plus a client-side check; a violation surfaces as a
  validation error from `parse()`, not as an API guarantee.

Limits of the JSON-schema subset (same page, "JSON Schema limitations" and "Schema complexity
limits"):

| Limit | Detail |
|---|---|
| Not supported | Recursive schemas; numeric constraints (`minimum`, `maximum`, `multipleOf`); string length constraints; array constraints other than `minItems` 0 or 1; `additionalProperties` other than `false`; external `$ref`; complex types in enums |
| Supported | Basic types, `enum`, `const`, `anyOf`, `allOf` (not with `$ref`), internal `$ref`/`$defs`, `required`, string formats `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`, `ipv4`, `ipv6`, `uuid`, simple regex `pattern` |
| Maps / records | An object with unknown keys can only come back as `{}`. Use an array of `{key, value}` objects |
| Optional parameters | At most 24 across all strict schemas in a request |
| Union-typed parameters | At most 16 parameters using `anyOf` or type arrays (a nullable field such as `z.string().nullable()` is sent as `anyOf`) |
| Strict tools | At most 20 per request |
| Compilation | First use of a schema adds latency while the grammar compiles; compiled grammars are cached 24 hours from last use; "Schema is too complex for compilation" is a 400; 180-second compile timeout |
| Property order | Required properties are emitted first, then optional ones |
| Enum casing | "Structured outputs don't guarantee the capitalization of string `enum` and `const` values"; compare case-insensitively |
| Incompatible | Citations (400 if both are enabled); assistant message prefill |
| Compatible | Message Batches, token counting, streaming, strict tools in the same request |
| Prompt caching | "Changing the `output_config.format` parameter invalidates any prompt cache for that conversation thread" |
| Cost | An extra system prompt describing the format is injected and billed as input |
| Data handling | Prompts and outputs are not stored under ZDR, but "the JSON schema itself is temporarily cached for up to 24 hours"; do not put PHI in schema names, enum values or patterns |
| Failure modes | `stop_reason: "refusal"` and `stop_reason: "max_tokens"` can produce output that does not match the schema; both must be checked |

Forced tool choice as a way to get JSON: the pricing page's tool-use table has no value in the
"`any`, `tool`" column for Claude Opus 5.5 and Claude Sonnet 5.5, while Haiku 5.5 and older models
have one (https://platform.claude.com/docs/en/about-claude/pricing#tool-use-pricing). That is
consistent with forced `tool_choice` not being accepted on those two models. **Likely**; not tested
here. `output_config.format` is the documented route on every model, so Factloom does not need
forced tool choice.

### 4. Test: Zod-validated extraction with the cheapest current model

The script below was run from a throwaway directory outside the repository and is reproduced in
full, except that the environment variable holding the key is shown under the SDK's default name
(`ANTHROPIC_API_KEY`; the run read the key from a differently named variable). Node v22.23.4, `@anthropic-ai/sdk` 1.8.0, `zod` 4.6.7,
model `claude-haiku-5-5`. **Confirmed** by running on 2026-11-13.

```js
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const Extraction = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["person", "organization", "technology", "project", "other"]),
    }),
  ),
  facts: z.array(
    z.object({
      subject: z.string().describe("Entity name, must appear in entities"),
      predicate: z.string().describe("Short snake_case relation"),
      object: z.string(),
      valid_from: z.string().nullable().describe("ISO date the fact became true, or null if not stated"),
      valid_to: z.string().nullable().describe("ISO date the fact stopped being true, or null"),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const text =
  "The Atlas project switched its test runner from Jest to Vitest in March 2026. " +
  "Its auth module, maintained by Priya Nair, uses JWT with refresh tokens.";

const res = await client.messages.parse({
  model: "claude-haiku-5-5",
  max_tokens: 2000,
  system: "Extract entities and facts from the text. Only state what the text says.",
  messages: [{ role: "user", content: text }],
  output_config: { format: zodOutputFormat(Extraction) },
});
console.log(res.parsed_output, res.usage);
```

Output (abridged only by removing whitespace; all items shown):

```
model: claude-haiku-5-5  stop_reason: end_turn  wall time: 3523 ms
entities:
  Atlas (project), Jest (technology), Vitest (technology), Priya Nair (person),
  Auth module (project), JWT (technology)
facts:
  Atlas        test_runner                  Vitest                   valid_from 2026-03-01  valid_to null        confidence 0.9
  Atlas        previously_used_test_runner  Jest                     valid_from null        valid_to 2026-03-01  confidence 0.8
  Auth module  part_of                      Atlas                    valid_from null        valid_to null        confidence 0.7
  Auth module  maintained_by                Priya Nair               valid_from null        valid_to null        confidence 0.9
  Auth module  uses                         JWT with refresh tokens  valid_from null        valid_to null        confidence 0.9
zod re-validate (Extraction.safeParse): true
usage: {"input_tokens":898,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,
        "output_tokens":400,"output_tokens_details":{"thinking_tokens":0},"service_tier":"standard"}
```

Observations from the run:

- Cost of this call: 898 x $0.10/MTok + 400 x $0.50/MTok = $0.00029.
- 898 input tokens for a two-sentence text: most of the input is the schema and the injected format
  instructions, not the text. A second throwaway script (`cache.mjs`, not kept) used the free
  `count_tokens` endpoint: a 23-token user message plus an 1,818-token system prompt counted 1,841
  tokens, and adding this schema raised it to 2,438 (about 600 tokens for the schema).
- "March 2026" became `2026-03-01`. The model picked a day the text did not state. The fact schema
  needs a way to express date precision, or the prompt must forbid inventing a day. This is a schema
  design input, not an SDK issue.
- The model returned a previous-state fact (`previously_used_test_runner` with `valid_to`) without
  being asked, which is the shape bi-temporal storage needs.

Prompt caching check (`cache.mjs`, two sequential calls with the same ~2,400-token prefix, system
block marked `cache_control: { type: "ephemeral" }`). **Confirmed**:

```
call 1: {"input":21,"cache_write":2417,"cache_read":0,"output":153}
call 2: {"input":23,"cache_write":0,"cache_read":2417,"output":168}
```

The cached prefix included the schema and injected format instructions (2,417 > 1,818 system
tokens), so the schema is part of the cached prefix when a breakpoint is on the system block.

Total spend for all test calls in this research: under $0.002 (three message calls on Haiku 5.5;
token counting is free).

### 5. Cost features for repeated extraction calls

Prompt caching. Source: https://platform.claude.com/docs/en/build-with-claude/prompt-caching.
All **confirmed**.

- Two ways to enable: a single top-level `cache_control: { type: "ephemeral" }` on the request
  (automatic), or `cache_control` on individual content blocks (explicit breakpoints).
- The cache is a prefix match in the order `tools`, `system`, `messages`, "up to and including the
  block designated with `cache_control`". "Cache hits require 100 percent identical prompt segments."
  Anything that varies per request (the memory text, timestamps) must come after the breakpoint.
- TTL: 5 minutes by default, refreshed at no cost on each hit; `"ttl": "1h"` for one hour at the
  2x write price. The lifetime is measured from the start of the request.
- Prices: write 1.25x (5m) or 2x (1h) base input; read 0.1x, except 0.05x on Opus 5.5 / Sonnet 5.5
  and 0.025x on Fable 5.2 / 5.1. "5-minute duration: [pays off] after one cache read."
- Minimum cacheable prompt length on the Anthropic API: 512 tokens for Haiku 5.5, Sonnet 5.5,
  Opus 5.5, Opus 5 and the Fable models; 1,024 for Opus 4.8, Sonnet 5, Sonnet 4.6; 2,048 for
  Opus 4.7; 4,096 for Opus 4.6, Opus 4.5 and Haiku 4.5. Shorter prefixes are processed without
  caching and without an error; check `usage.cache_creation_input_tokens` and
  `usage.cache_read_input_tokens`.
- Caches are isolated per workspace and per model.
- `max_tokens: 0` pre-warms a cache without generating output.

Message Batches API. Source: https://platform.claude.com/docs/en/build-with-claude/batch-processing.
All **confirmed**.

- "All usage is charged at 50 percent of the standard API prices."
- Asynchronous: "most batches completing within 1 hour"; results are available when all requests
  finish or after 24 hours; unfinished requests expire at 24 hours and are not billed.
- Limits: 100,000 requests or 256 MB per batch; results downloadable for 29 days; results come back
  in any order and are matched by `custom_id`.
- Combines with caching: "The pricing discounts from prompt caching and Message Batches can stack",
  but hits are "best-effort" ("cache hit rates ranging from 30 percent to 98 percent"). The page
  suggests the 1-hour TTL for batches with shared context.
- Works with structured outputs (structured-outputs page, "Feature compatibility").

Token counting. Source: https://platform.claude.com/docs/en/build-with-claude/token-counting.
**Confirmed**, and run here.

- `client.messages.countTokens({ model, system, messages, tools, output_config })` returns
  `input_tokens` for the request as it would be sent.
- "Token counting is free to use but subject to requests per minute rate limits"; its limits are
  separate from message creation.
- "The token count is an estimate."

### 6. Rate limits and usage tiers

Source: https://platform.claude.com/docs/en/api/rate-limits. All **confirmed**.

- Tiers are Start, Build, Scale and Custom, assigned automatically from usage history. "New
  organizations ... may start in the Evaluation tier, with limits below the standard limits shown on
  this page." The Console page `platform.claude.com/usage/limits` shows the actual tier.
- Monthly spend caps: Start $500, Build $1,000, Scale $200,000. A lower self-set limit is possible
  in the Console. Reaching the tier cap returns HTTP 429 with
  `error.details.error_code: "enforced_spend_limit_reached"` and no `retry-after`, so retries
  (including the SDK's automatic ones) keep failing until the month rolls over.
- Start tier limits per model: Haiku 5.5, Sonnet 5.5 and Opus 5.5 each 4,000 requests/min,
  2,000,000 input tokens/min, 400,000 output tokens/min. Fable 5.2: 4,000 / 500,000 / 100,000.
- "The API's default ITPM rate limits count only uncached input tokens": cache reads do not count.
- Ramp limits: a sudden jump in per-minute usage can return 429
  (`error_code: "ramp_limit_exceeded"`) even under the tier limit. "Start scheduled or bulk jobs at
  a low rate and spread requests evenly." The Message Batches API "isn't subject to ramp limits."
- Batches (Start tier): 1,000 requests/min to the batch endpoints, 200,000 batch requests in the
  processing queue, 100,000 per batch.

For one developer, the Start-tier token limits are far above what interactive memory writes need.
The two things that can actually bite are the Evaluation tier's lower, unpublished limits on a new
organization, and the ramp limit when a background job starts abruptly.

## What it means for Factloom

### Recommendation (for the owner's decision)

| Job | Suggested model | Mode | Reasoning |
|---|---|---|---|
| Entity/fact extraction at write time | `claude-haiku-5-5` | Synchronous, prompt cached | The overview page positions it for extraction; it is 20x cheaper than Sonnet 5.5 on input and output; the test produced a correct, schema-valid result in about 3.5 s. Coding agents wait on this call, so latency matters |
| Conflict detection at write time | `claude-haiku-5-5` by default; `claude-sonnet-5-5` as a configurable step up | Synchronous, prompt cached | A wrong "conflict" verdict invalidates a true fact, so this is the job where a stronger model may pay for itself. That should be decided by a small labelled evaluation, not assumed. Make the model a per-job setting |
| Re-verification of stale facts (background) | Same model as conflict detection | Message Batches + 1-hour cache | Not latency-sensitive; batch halves the price and is exempt from ramp limits |

The simplest starting point is one model (`claude-haiku-5-5`) for all three jobs with the model ID
as configuration per job, and an evaluation set to decide whether conflict detection needs Sonnet
5.5. Opus 5.5 and Fable 5.2 are not justified for these jobs on current evidence.

### Rough cost per 1,000 memories (ESTIMATE)

This is an estimate from stated assumptions, not a measurement of a real workload.

Assumptions per extraction call:

- P = 3,000 tokens of stable prefix (instructions, a few examples, the schema and injected format
  text). Measured reference: 2,417 tokens in the caching test with a simple schema.
- I = 500 tokens of per-memory input (the memory text plus some existing-entity context).
- O = 400 output tokens (measured: 400 for two sentences, 153 to 168 for one sentence).
- One LLM call per memory. If conflict detection is a second call of similar size, double the
  figures.
- "Cached" assumes every call is a cache hit; the first call in each 5-minute window pays a write
  (3,000 x 1.25 x base input) instead.
- Thinking tokens, if the model uses them, are billed as output and are not included (the test calls
  reported `thinking_tokens: 0`).

Formula per call: `P x price(P) + I x input + O x output`, then x 1,000.

| Model | No cache | Cached (sync) | Batch, no cache | Batch + cache |
|---|---|---|---|---|
| `claude-haiku-5-5` | (3,500 x 0.10 + 400 x 0.50) / 1e6 = $0.00055 -> **$0.55** | (3,000 x 0.01 + 500 x 0.10 + 400 x 0.50) / 1e6 = $0.00028 -> **$0.28** | half of no cache -> **$0.28** | half of cached -> **$0.14** |
| `claude-sonnet-5-5` | (3,500 x 2 + 400 x 10) / 1e6 = $0.011 -> **$11.00** | (3,000 x 0.10 + 500 x 2 + 400 x 10) / 1e6 = $0.0053 -> **$5.30** | **$5.50** | **$2.65** |
| `claude-opus-5-5` | (3,500 x 4 + 400 x 20) / 1e6 = $0.022 -> **$22.00** | (3,000 x 0.20 + 500 x 4 + 400 x 20) / 1e6 = $0.0106 -> **$10.60** | **$11.00** | **$5.30** |

Reading the table: on Haiku 5.5, output tokens are the largest part of the cached cost
($0.20 of $0.28 per 1,000), so keeping the output schema compact matters more than further prompt
trimming. Caching roughly halves the cost on every model at these sizes.

### Consequences for the design stages

- Keep the stable part of every prompt (instructions, examples, schema) byte-identical and first;
  put the memory text last. One changed character in the prefix, or a changed output schema, is a
  cache miss.
- The prefix must be at least 512 tokens on Haiku 5.5 / Sonnet 5.5 to cache at all. Extraction
  prompts with a schema clear this easily (2,417 measured).
- The fact schema sent to the model has to fit the JSON-schema subset: no recursion, closed objects,
  no maps, at most 24 optional fields and 16 nullable/union fields per request. Prefer required
  fields with explicit `null` over optional fields, and keep the LLM-facing schema smaller than the
  storage schema.
- Numeric bounds (confidence 0 to 1) and string lengths are enforced only by the client-side Zod
  check. A failed check needs a defined behaviour (retry once, then reject).
- Handle `stop_reason` values `refusal` and `max_tokens` explicitly; in both cases the output may
  not match the schema.
- Do not put customer data in schema field names, enum values or patterns (schema is cached 24 h).
- Background jobs should start slowly or use the Batches API to avoid ramp-limit 429s, and must not
  blindly retry a 429 that carries `enforced_spend_limit_reached`.
- Pin the SDK version exactly.

### Observations for a provider-neutral LLM interface in `core`

These are observations only; the architecture stage designs the interface.

- Every Factloom job in scope (extraction, conflict detection, verification) is one operation:
  given instructions, an input text and a Zod schema, return a value that satisfies the schema.
  No job needs tool loops, streaming or multi-turn conversation.
- What the Anthropic SDK returns that callers will want regardless of provider: the parsed value,
  token usage (input, output, cache read, cache write), the model ID actually used, and a stop
  reason that distinguishes complete / truncated / refused.
- What is provider-specific and probably belongs inside the Anthropic adapter rather than in the
  interface: cache breakpoints and TTLs, the `output_config.format` wire shape, the schema
  transformation, retry and rate-limit handling, batch submission mechanics.
- The interface can accept a hint that separates "stable instructions" from "per-call input"; the
  Anthropic adapter needs that split to place the cache breakpoint, and other providers can ignore
  it.
- Batch execution is asynchronous (submit, poll, collect by ID, up to 24 hours). If background
  re-verification uses it, that is a second, optional operation with a different shape from the
  synchronous call, not a flag on the same call.
- The JSON-schema subset above is a reasonable lowest common denominator to design the LLM-facing
  schemas against; schemas that stay inside it are likely to port to other providers' structured
  output features, though that portability was not tested here.

## Conflicts with settled decisions

None found. Zod (v4), TypeScript on Node and Claude as the default LLM are all directly supported by
the current SDK.

## Open questions

- Whether `claude-haiku-5-5` is accurate enough for conflict detection on real coding-agent memories,
  or whether `claude-sonnet-5-5` is needed. Needs a small labelled evaluation. **Unverified.**
- Extraction quality was checked on one two-sentence example only. No accuracy figure exists yet.
- How Haiku 5.5's adaptive thinking and `output_config.effort` (default `medium`) affect cost and
  quality for extraction. The test calls reported zero thinking tokens; this was not explored.
  **Unverified.**
- Whether forced `tool_choice` is rejected on Opus 5.5 / Sonnet 5.5 (inferred from an empty table
  cell, not tested). Not needed if Factloom uses `output_config.format`.
- The limits of the Evaluation tier that a new organization may start in are not published on the
  rate-limits page, and the owner's organization tier was not checked.
- Real token sizes per memory. The cost table uses assumed sizes; replace them with measured values
  once the extraction prompt exists.
- Cache hit rate under a realistic write pattern (coding-agent writes may be more than 5 minutes
  apart, which would make most calls cache writes at 1.25x rather than reads). The 1-hour TTL at 2x
  may or may not pay off; needs measurement.
- Portability of the same Zod schemas to other providers' structured output was not tested.
