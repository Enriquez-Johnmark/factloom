# Claude is the default LLM, behind a one-method interface

Status: accepted

Extraction, conflict detection and verification use Claude through the Anthropic API. `core` sees only `LlmClient`, which has one method: produce an object that matches a Zod schema from fixed instructions and a variable input. The Anthropic implementation lives in the app.

One method is enough because structured output from a schema is all three jobs need. Each call names its task, so the composition root can choose a model per task; the research suggests the smallest current model for all three to begin with, at an estimated $0.14 to $0.55 per thousand extraction calls. The figures are an estimate from stated assumptions about the size of a call, not a measurement, and the choice of model is to be confirmed by the eval set ([research](../../research/technical/llm-anthropic.md)). Splitting the prompt into fixed and variable parts lets the implementation use prompt caching without the interface mentioning it.

## Considered options

- **Call the Anthropic SDK from the use cases.** Rejected: tests would need a key, and another provider would mean editing use cases.
- **A multi-provider LLM library.** Rejected: a dependency in place of one small interface with one implementation.

## Consequences

The structured-output subset of JSON Schema that the API accepts limits the extraction schema: no recursion, closed objects, and a cap on optional fields. The extraction schema is designed inside those limits.
