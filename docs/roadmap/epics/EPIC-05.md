# EPIC-05: Recall

| | |
|---|---|
| Status | Pending |
| Phases | 1 |
| Packages | `@factloom/graph-rag`, `apps/mcp-server` |
| Requirements | REQ-03, REQ-04, REQ-05, REQ-09, REQ-27, REQ-35 |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Factloom answers a question with the facts that match it, filtered by time. By default every fact returned is a **current fact**. With an **as-of date** or a **known-at date** it answers what was true, or what Factloom believed, on that date. Three **retrieval lanes** find candidates and **rank fusion** merges them, with lane weights set by measurement. A fact's history can be read back with its sources and the audit entries that explain each change.

## Scope

- The local `Embedder`.
- Rank fusion as a pure function.
- The use cases `recall` and `getFactHistory`.
- The retrieval eval (FL-033), and the default lane weights chosen with it (FL-057).

## Out of scope

- The vector lane and the keyword lane inside the SQLite adapter, and the time predicate in SQL: [EPIC-03](EPIC-03.md).
- The `recall` and `get_fact_history` tools: [EPIC-06](EPIC-06.md).
- Recording which facts were recalled, and leaving an **archived fact** out of recall: [EPIC-09](EPIC-09.md), FL-055 and FL-073.
- The performance benchmark: FL-066 in [EPIC-07](EPIC-07.md). This epic must meet the budgets it enforces.
- A reranking model, and graph expansion over more than one step ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md), "Considered options"). See "Open decisions".
- A hosted embedding model.

## Boundaries and constraints

- Every lane applies the time filter in its own read, and rank fusion is a pure function in `graph-rag` ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)).
- Reads never write ([`INTERFACES.md`](../../architecture/INTERFACES.md), "What a caller must know beyond the signatures").
- The embedder sits behind the `Embedder` interface and lives in `apps/mcp-server`. Its model and dimensions are recorded with every vector ([ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md)).
- `graph-rag` imports neither the storage adapter nor an embedding library ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)).
- A **score** says how well a fact matches the question. It is never used as a **confidence**.

## Dependencies

- [EPIC-01](EPIC-01.md): the `pnpm eval` command (FL-001) and its workflow job (FL-002), which run the tests that need the real embedding model.
- [EPIC-02](EPIC-02.md): the types, the `MemoryStore` interface with `getSource`, the in-memory store and the test helpers, and `recordFacts` (FL-008), with which the retrieval eval loads its statements.
- [EPIC-03](EPIC-03.md): the keyword lane (FL-016) and the vector lane (FL-017), which the retrieval eval measures.

## Deliverables

- The local `Embedder` in `apps/mcp-server`.
- The rank fusion function, internal to `graph-rag`.
- The use cases `recall` and `getFactHistory`, exported from `@factloom/graph-rag`.
- The retrieval eval, its data, and a new ADR that records the default lane weights.

## Success criteria

- `pnpm check` passes with the tests of every work item below that need no embedding model, and `pnpm eval` passes with those that need it.
- A unit test of `recall` with no date returns only current facts (REQ-03).
- Unit tests of `recall` answer an as-of question, a known-at question and a question with both, and the boundary instant (REQ-04).
- The retrieval eval prints recall@1, recall@5 and MRR for each lane-weight variant, and the default weights are recorded in an ADR (REQ-05).
- A unit test of `getFactHistory` returns a succession with the audit entries and sources of each fact (REQ-09).
- The `recall` budgets of REQ-35 are met, as measured by the benchmark of FL-066.

## Open decisions

| Decision | What is known |
|---|---|
| Whether a reranking model is added after rank fusion | Not used. [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) lists it under "Considered options". It is considered only if the measurements of FL-057 show that the merged ranking is not good enough, and it would then have to fit the `recall` budgets of REQ-35 |

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-026 | Local embedder with bge-small-en-v1.5 | 1 | FL-002, FL-006 | Pending |
| FL-030 | Rank fusion as a pure function | 1 | FL-004 | Pending |
| FL-031 | recall use case | 1 | FL-007, FL-030, FL-056 | Pending |
| FL-032 | getFactHistory use case | 1 | FL-007, FL-056 | Pending |
| FL-033 | Retrieval eval: harness and data | 1 | FL-008, FL-016, FL-017, FL-026, FL-031 | Pending |
| FL-057 | Lane weights chosen by measurement | 1 | FL-033 | Pending |

### FL-026: Local embedder with bge-small-en-v1.5

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-002, FL-006 |
| Requirements | REQ-27 |
| Components | `apps/mcp-server` |

**Objective.** Implement `Embedder` with a model that runs on the user's machine, so that statements and questions become vectors with no API key and no text leaving the machine.

**Background.** [ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md) chose `BAAI/bge-small-en-v1.5` through Transformers.js: 384 dimensions and a quantised model of about 32 MB. The [embeddings research](../../research/technical/embeddings.md), section 3, verified the library, its version on 2026-11-13, its native runtime and its behaviour on first use. The [spike](../../../spikes/embedding-retrieval/README.md) measured the model on 60 statements and 40 questions and records exactly what was run:

- the `Xenova/bge-small-en-v1.5` ONNX conversion, at the revision the spike lists;
- CLS pooling, and vectors of unit length;
- the model card's instruction in front of each question and nothing in front of a statement, which gave the model's best result;
- an install of 745 MB on Linux x64 before any model is downloaded, most of it the native runtime;
- a first run that downloads the model files from `huggingface.co` and later runs that use the cache.

By default the library keeps its cache inside `node_modules` (research, section 3). Nothing was measured on Apple Silicon (open question Q-23).

[`TESTING.md`](../../architecture/TESTING.md) says that `pnpm check` needs no network, no API key and no embedding model, and that a second command, `pnpm eval`, runs what needs the real model, including this embedder's own tests, on demand and in a separate continuous integration job (FL-001, FL-002). This item adds the first tests to `pnpm eval`.

**Outcome.** The composition root can build an `Embedder`. Fact operations embed statements with it, `recall` embeds questions with it, and the SQLite adapter checks its model and dimensions against the database.

**Scope.**
- A factory in `apps/mcp-server` that returns an `Embedder`.
- The statement and question forms.
- The mapping of every failure to `embedding_failed`.

**Non-goals.**
- A hosted model, a second local model, or a second runtime.
- An explicit download step, and offline mode. Q-24 stays open.
- Embedding again after a change of model. The stored statements make it possible later ([ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md)).
- Moving the embedder to an optional package to reduce the install size. ADR 0014 names this as the step to take if the size proves a problem.
- Measurements on Apple Silicon: FL-038.

**Functional requirements.**
1. `embed(texts, 'statement')` embeds each text unchanged. `embed(texts, 'question')` puts the model card's question instruction, as quoted in the spike, in front of each text.
2. The result has one vector per text, in the same order. Each has 384 values and unit length. An empty list returns an empty list.
3. `dimensions` is 384. `model` is a string that names the model repository, its revision and its quantisation variant, so that a change of any of them is detected as `embedding_model_mismatch` by the storage adapter.
4. `model` and `dimensions` are available without loading the model.
5. The model is loaded on the first call to `embed`, not when the embedder is built. The server can then answer `tools/list` before any download.
6. The first call downloads the model files if they are not in the cache directory. Later calls use the cache.
7. A failure to download, to load or to run the model returns `embedding_failed`, and never throws. When the model files are missing and cannot be fetched, the message says that the first use needs network access to `huggingface.co`.
8. Nothing is written to standard output while loading or embedding. Standard output belongs to the MCP protocol ([MCP research](../../research/technical/mcp.md), "Practical constraints").

**Technical requirements.**
1. `@huggingface/transformers` is a dependency of `apps/mcp-server` only, with an exact version and no range. The version is the latest on the registry on the day of implementation, checked with `npm view` and cited in the commit message. The research records the version it verified. The pin test of FL-001 fails if it is a range; this item adds no pin test of its own.
2. The model repository, revision, quantisation variant and pooling are named constants, taken from the spike's "Model configurations" table and from ADR 0014. The revision is pinned, because the spike notes that an unpinned revision can change results.
3. The factory takes the cache directory as an argument. The composition root passes a directory outside `node_modules` (FL-034).
4. Texts given in one call are embedded together.
5. The tests that load the model run under `pnpm eval` only, selected by the naming rule of FL-001. They share one cache directory, `.cache/models` at the repository root, which git ignores and which the eval job of FL-002 keeps between runs. The first run on a machine needs network access to download the model. No test writes into the user's home directory.
6. The two tests that need no model, "reports its model and dimensions before the model is loaded" and "returns embedding_failed when the model files are missing and cannot be fetched", run under `pnpm check`, with an empty temporary cache directory and fetching turned off.

**Constraints.**
- [ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md) and [ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md).
- [ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md): an adapter catches what its library throws.

**Acceptance criteria.**
- [ ] Under `pnpm eval`, tests pass with these names: "returns one unit vector of 384 values for each text, in order", "returns an empty list for an empty list", "embeds a question differently from the same text as a statement", "returns the same vector for the same text on two calls", "scores a statement nearer to its paraphrase than to an unrelated statement".
- [ ] Under `pnpm eval`, a test named "writes nothing to standard output" runs the embedder in a child process, embeds one text, and asserts that the child's standard output is empty.
- [ ] Under `pnpm check`, tests pass with these names: "reports its model and dimensions before the model is loaded", "returns embedding_failed when the model files are missing and cannot be fetched". The second uses an empty cache directory and a setting that prevents fetching.
- [ ] `pnpm check` passes with no network access and with `.cache/models` absent.
- [ ] The eval job of FL-002 is started by hand and passes, and its log shows the tests above. A second start shows the model taken from the kept cache, with no download. Both addresses are recorded.
- [ ] After a clean install on Linux, the size of `node_modules` (`du -sh node_modules` at the repository root) and the size of the cache directory after the first run are recorded.

**Validation.** Tests in `apps/mcp-server` with the real model under `pnpm eval`, locally and in the eval job. Two tests with no model on every check. The retrieval eval (FL-033) measures the quality of the vectors.

**Completion evidence.** The commit, with the registry check in its message. The passing output of `pnpm check` and of `pnpm eval`, and the addresses of the two eval job runs. The two measured sizes, recorded next to the 745 MB figure in the [embeddings research](../../research/technical/embeddings.md).

### FL-030: Rank fusion as a pure function

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-004 |
| Requirements | REQ-05 |
| Components | `@factloom/graph-rag` (internal) |

**Objective.** Merge several ranked lists of fact identifiers into one ranked list with a **score** for each fact, by weighted reciprocal rank fusion.

**Background.** [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) fuses ranks, not the lanes' own numbers, because cosine distance, a keyword rank and a graph rank are not comparable. It keeps the fusion out of SQL so that it is tested without a database and is the same for every storage adapter. The [spike](../../../spikes/embedding-retrieval/README.md) used the sum of `1 / (60 + rank)` over the lists, with equal weight, and found that the way the lists were fused moved the result more than the choice of model did. The weights are therefore parameters.

**Outcome.** One pure function that `recall` (FL-031) calls and whose weights the retrieval eval varies (FL-033, FL-057).

**Scope.**
- The function, and its tests.

**Non-goals.**
- Choosing the default weights: FL-057.
- A reranking model.
- Reading from memory. The function sees only identifiers.

**Functional requirements.**
1. The function takes any number of ranked lists, each with a weight, and a constant `k`.
2. The score of an identifier is the sum, over the lists that contain it, of `weight / (k + rank)`, where the first position has rank 1.
3. The result is every identifier with a score above zero, ordered by score, highest first.
4. Two identifiers with equal scores are ordered by the earliest list, in argument order, that contains either of them, and then by the better rank in that list. The order is therefore total and the same on every run.
5. A list with weight 0 is ignored. An identifier found only in such lists is not in the result.
6. An identifier that occurs twice in one list counts once, at its better rank.
7. A negative weight, or a `k` that is not above zero, returns `invalid_input`.
8. No lists, or only empty lists, return an empty result.

**Technical requirements.**
1. The function is pure and synchronous: no dependencies, no clock, no randomness.
2. It is not exported from the package ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): rank fusion is internal).

**Constraints.**
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md).

**Acceptance criteria.**
- [ ] Tests pass with these names: "returns one list in its own order", "ranks a fact found by two lanes above a fact found by one at the same rank", "gives a lane with a higher weight more say", "ignores a lane with weight zero", "leaves out a fact found only by a lane with weight zero", "breaks a tie by the earlier lane and then the better rank", "counts a repeated fact once at its better rank", "returns an empty list for no lanes", "returns invalid_input for a negative weight", "returns invalid_input for a constant that is not above zero".
- [ ] One test computes the scores of a three-list example by hand in a comment and asserts each score to six decimal places.
- [ ] `pnpm check` passes.

**Validation.** Direct unit tests with no fakes, on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

### FL-031: recall use case

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-007, FL-030, FL-056 |
| Requirements | REQ-03, REQ-04, REQ-05 |
| Components | `@factloom/graph-rag` |

**Objective.** Implement `recall`: answer a question with the facts that match it, found by three retrieval lanes, filtered by time, and merged by rank fusion.

**Background.** The signature and the behaviour are in the "Use cases" section of [`INTERFACES.md`](../../architecture/INTERFACES.md). The flow is drawn in [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md), "Recall", and the lanes are described in [`SCHEMA.md`](../../architecture/SCHEMA.md), "How the three retrieval lanes use the schema". The time defaults are in the table under "`recall`" in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md).

```ts
export declare function recall(
  deps: Pick<OperationDeps, 'store' | 'embedder' | 'now'>,
  input: {
    readonly namespace: Namespace;
    readonly question: string;
    readonly validAt: Timestamp | null;
    readonly knownAt: Timestamp | null;
    readonly limit: number;
  },
): Promise<Result<{ readonly facts: readonly RecalledFact[] }>>;
```

**Outcome.** A caller asks a question in natural language and gets the best matching facts, each with its sources, its confidence and a score. With no date, every fact is current. With dates, the answer is what was true, or what Factloom believed, then.

**Scope.**
- The use case, in one file, exported with its input and output types.
- The graph lane, which is built here from `listFacts`.
- One settings object with the lane weights, the length of each lane's list and the fusion constant.

**Non-goals.**
- The final values of the settings: FL-057. This item uses provisional values.
- The vector and keyword lanes themselves. They are methods of `MemoryStore`: FL-056 for the in-memory store, FL-016 and FL-017 for SQLite.
- Recording that a fact was recalled. Reads never write. Usage is tracked outside the read path in FL-055.
- Graph expansion over more than one step.
- A parameter on the MCP tool for the settings.

**Functional requirements.**
1. Input is checked first: an empty question, or a limit below 1, is `invalid_input`.
2. The time filter is built from `now`. `knownAt` defaults to now. `validAt` defaults to `knownAt` when only `knownAt` is given, and to now when neither is given. The same filter is passed to every lane.
3. The question is embedded with purpose `question`.
4. The vector lane and the keyword lane each return their best facts for the question, up to the lane list length.
5. The graph lane takes the subject entity and the object entity of every fact the first two lanes found. It reads the facts that touch any of those entities and pass the time filter, with `listFacts` and `touchingEntityIds`, up to a fixed limit. It ranks them by how many of those entities each fact touches, most first, then by how recently the fact was recorded, then by identifier.
6. The three ranked lists are merged with the function of FL-030, in the order vector, keyword, graph, with the weights from the settings.
7. The result is the first `limit` facts by score, best first, each with its subject, its object entity if it has one, its sources and its score.
8. No match is an empty list, not an error.
9. An error from the embedder or from the store is returned as it is.
10. The use case makes no write.

**Technical requirements.**
1. The exported `recall` has the signature above. It calls one internal function that takes the settings as an argument, so that tests and the retrieval eval (FL-033) can vary them without changing the signature.
2. The settings are one typed constant. Provisional values: every lane weight 1, the fusion constant 60 as in the [spike](../../../spikes/embedding-retrieval/README.md), and a lane list length of 50, the largest limit the MCP tool accepts. When `limit` is larger than the lane list length, the lanes are asked for `limit` facts.
3. The limit of the graph lane's read is a named constant, so that an entity that most facts touch cannot make the read unbounded (open question Q-14).
4. Unit tests use the in-memory store, whose ranking is naive. They assert on which facts are returned, not on their exact order ([`TESTING.md`](../../architecture/TESTING.md), "Unit tests").

**Constraints.**
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md): the time filter is inside each lane.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): one namespace.
- [`.claude/rules/testing.md`](../../../.claude/rules/testing.md), "Time cases are explicit".

**Acceptance criteria.**
- [ ] Unit tests pass with these names, each stating its as-of date and its known-at date: "returns only current facts when no date is given", "does not return an invalidated fact when no date is given", "does not return an ended fact when no date is given", "returns the fact that was true on the as-of date", "returns a fact with an unknown start for any earlier as-of date", "does not return a fact at the instant its valid time ends", "returns what was believed on the known-at date, including a fact invalidated since", "uses the known-at date as the as-of date when only the known-at date is given", "answers what was believed on one date about another date".
- [ ] Unit tests pass with these names: "returns no more facts than the limit", "returns an empty list when nothing matches", "returns each fact with its sources and a score", "returns a fact that only the graph lane finds", "does not return a fact from another namespace", "returns invalid_input for an empty question", "returns embedding_failed when the question cannot be embedded".
- [ ] The graph lane test calls the internal function with a lane list length of 1, so that the fact is found by neither of the other lanes.
- [ ] A test named "writes nothing" asserts that the store holds the same facts, sources and audit entries after a call as before.
- [ ] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag` with the in-memory store, the fake embedder and a fixed clock, on every check. Quality against real lanes is measured in FL-033.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

### FL-032: getFactHistory use case

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-007, FL-056 |
| Requirements | REQ-09 |
| Components | `@factloom/graph-rag` |

**Objective.** Implement `getFactHistory`: return the facts linked to a given fact by **supersession**, with the audit entries that explain each change.

**Background.** The signature and the behaviour are in the "Use cases" section of [`INTERFACES.md`](../../architecture/INTERFACES.md): it "follows supersession links in both directions from the given fact. For a single-valued predicate it also includes every other fact for the same subject and predicate, which is the timeline of that value. Entries are ordered by valid time, then by recorded time." It answers requirement REQ-CA-06 of the [competitive analysis](../../research/evaluations/competitive-analysis.md). The timeline scenarios assert through it ([`TESTING.md`](../../architecture/TESTING.md), "Layer B").

```ts
export declare function getFactHistory(
  deps: Pick<OperationDeps, 'store' | 'domain'>,
  input: { readonly namespace: Namespace; readonly factId: FactId },
): Promise<Result<{ readonly entries: readonly FactHistoryEntry[] }>>;
```

**Outcome.** Starting from any fact, live or not, a caller sees how that fact changed and why: each fact in the chain, with its sources and its audit entries.

**Scope.**
- The use case, in one file, exported with its input and output types.

**Non-goals.**
- A label for the kind of each link, such as succession or correction. The audit entries carry the operation and the reason code, and the scenario runner derives the kind from them (FL-039).
- Reading through an **entity merge**: FL-052.
- Paging. The read has one fixed upper bound.

**Functional requirements.**
1. A fact that does not exist in the namespace is `not_found`.
2. Forward: from the given fact, the use case follows `supersededByFactId` until a fact that has none.
3. Backward: for each fact reached, it reads the facts that this fact superseded, with `listFacts` and `supersededByFactId`, and repeats for each of them.
4. When the fact's predicate is single-valued in the domain, it also reads every fact with the same subject and predicate, with the time filter `'all'`.
5. Each fact appears once.
6. Each entry carries the fact with its subject, object entity and sources, and the audit entries whose target is that fact, in the order they occurred.
7. Each audit entry is returned as an `ExplainedAuditEntry` ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Use cases"): the entry with `explanation`, the content of the source that explains the change, read with `MemoryStore.getSource`, or `null` when the entry names no source or the source has no content. The `get_fact_history` tool returns it as `explanation` ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "`get_fact_history`").
8. Entries are ordered by the start of valid time, with an unknown start first, then by the time the fact was recorded, then by identifier.
9. The use case makes no write. A storage error is returned as it is.

**Technical requirements.**
1. Dependencies first, input second, a `Result` returned.
2. Every read uses the time filter `'all'`, because a history includes invalidated facts. This is the one read that the time predicate does not filter ([`.claude/rules/data.md`](../../../.claude/rules/data.md)).
3. The walk keeps the set of facts already reached, so it ends even if the data held a cycle.
4. The limit passed to `listFacts` is a named constant.
5. The source that explains a change is not always a source of the fact it explains: the note that explains a retraction is linked to no fact. So the explanation is read with `MemoryStore.getSource` for the source each entry names, which returns a source whether or not a fact is linked to it (FL-007). A source named by several entries is read once.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): a fact has at most one successor link, set when it is invalidated.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md).

**Acceptance criteria.**
- [ ] Unit tests pass with these names: "returns a single fact with the audit entry of its recording", "returns both facts of a succession in order of valid time", "returns the same entries whichever fact of the chain is given", "returns the wrong fact and its correction with the entry that links them", "returns a retracted fact with the entry of its invalidation", "includes a fact for the same subject and single-valued predicate that no link reaches", "returns only linked facts for a multi-valued predicate", "puts a fact with an unknown start first", "returns each fact with its sources", "returns not_found for a fact in another namespace".
- [ ] Unit tests pass with these names: "returns the explanation of a correction with the entry that records it", "returns the explanation of a retraction although its source is linked to no fact", "returns no explanation for an entry that names no source".
- [ ] A test named "writes nothing" asserts an unchanged store after the call.
- [ ] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag` with the in-memory store, with memory built by change sets committed to the store, on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

### FL-033: Retrieval eval: harness and data

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-008, FL-016, FL-017, FL-026, FL-031 |
| Requirements | REQ-05 |
| Components | `apps/mcp-server` (evals), `@factloom/graph-rag` (one export) |

**Objective.** Build the retrieval eval: a fixed set of statements and questions, and a harness that measures `recall` on them with the real lanes and the real embedder for any given settings.

**Background.** [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) left the lane weights undecided. In the [spike](../../../spikes/embedding-retrieval/README.md), fusing a keyword ranking with an embedding ranking at equal weight scored below the embedding ranking alone at recall@1 under every recipe tried, because the keyword ranking votes with equal strength on natural-language questions where it is often wrong. The spike's keyword side was a hand-written BM25, not SQLite FTS5, and weighted fusion was not tried. [`TESTING.md`](../../architecture/TESTING.md), "Retrieval eval", says this eval is where the weights are set, with the real embedder and no LLM. Open questions Q-27 (the fusion constant and the number of candidates per lane) and Q-28 (whether the graph lane helps) wait on it.

The work is in two items. This one builds the data, the harness and the metrics, and measures the provisional settings of FL-031. FL-057 runs the variants, chooses the defaults and records them in an ADR.

**Outcome.** A command measures `recall` for any settings and prints recall@1, recall@5 and MRR@10. The numbers for the provisional settings are on record, and FL-057 has what it needs to compare variants.

**Scope.**
- The eval data: the 60 statements and 40 questions of the spike's `cases.json`, with their labels unchanged, copied into the eval. Each statement gains a subject entity, and an object entity where the statement names one, written by hand before any variant is run.
- An eval-only domain with one multi-valued predicate, so that loading the statements causes no conflict.
- A harness that loads the statements as facts through `recordFacts` (FL-008) into a SQLite store with the local embedder, then asks each question through `recall` with given settings.
- The metrics, and a command that prints them for a list of settings.
- One export of `@factloom/graph-rag` that runs recall with explicit settings.

**Non-goals.**
- The lane-weight variants, the choice of default settings, the acceptance bar and the ADR: FL-057.
- A larger or more realistic set of statements. The spike lists the limits of this one, and they still apply.
- Changing how the keyword lane builds its match expression. If the measurements show that is needed, the finding goes in the ADR of FL-057 and the change is a new work item in [EPIC-03](EPIC-03.md).
- Comparing embedding models. [ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md) is settled.
- A reranking model, an LLM judge, or questions with dates. Time semantics are covered by the contract suite (FL-012).

**Functional requirements.**
1. The harness takes a list of named settings: lane weights, lane list length and fusion constant. For each it reports recall@1, recall@5 and MRR@10 as the spike defines them, over all 40 questions and for each of the four question groups.
2. In this item the list holds three entries: the provisional settings of FL-031, the vector lane alone, and the keyword lane alone. A lane is turned off by weight 0.
3. Each run loads the 60 statements into a new database and asks the 40 questions in a fixed order. A question counts as answered at rank n when a fact labelled as its answer is at position n or better.
4. The metric functions are pure and are tested on hand-built rankings.

**Technical requirements.**
1. The eval lives in `apps/mcp-server/evals/`. The app is the composition root, the one place that the import rules allow to use the SQLite adapter, the use cases and the local embedder together ([`TESTING.md`](../../architecture/TESTING.md), "Layer B").
2. `recall` as specified in `INTERFACES.md` takes no settings. This item adds one export to `@factloom/graph-rag` that runs recall with explicit settings, the internal function of FL-031, and adds it to [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md).
3. The run is deterministic: a fixed clock, a counting identifier generator, a fixed order of statements and questions, a new database for each run.
4. A root script, `pnpm eval:retrieval`, runs every entry of the list and prints the table.
5. A test that runs under `pnpm eval`, not under `pnpm check`, runs the provisional settings only and asserts that the three numbers are printed and lie between 0 and 1. It sets no bar; FL-057 does. It needs the real embedding model, which `pnpm check` does not load ([`TESTING.md`](../../architecture/TESTING.md)).
6. The metric functions and the test "a lane with weight zero contributes no fact", which can use the fake embedder, run under `pnpm check`.

**Constraints.**
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) and [ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md).
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): only the app may import storage, graph-rag and the embedder together.
- [`.claude/rules/engineering-principles.md`](../../../.claude/rules/engineering-principles.md), "Accuracy": a measured result is labelled confirmed and cites the run.

**Acceptance criteria.**
- [ ] `pnpm eval:retrieval` exits with code 0 and prints one row for each of the three entries in requirement 2, with recall@1, recall@5 and MRR@10, and the same three numbers for each question group.
- [ ] Two runs of `pnpm eval:retrieval` in a row print identical tables.
- [ ] A test named "the eval data keeps the labels of the spike" compares the statements, questions and labels with `spikes/embedding-retrieval/cases.json` and passes.
- [ ] Unit tests of the metric functions pass, each against a hand-computed value written in the test: "counts a question as answered at rank 1 only when its fact is first", "gives the reciprocal of the rank of the first right fact", "gives 0 when no right fact is in the first ten".
- [ ] A test named "a lane with weight zero contributes no fact" passes in `pnpm check`, with the fake embedder: with the keyword and graph weights at 0, the facts returned for a question equal those of the vector lane for the same limit.
- [ ] A test named "the retrieval eval runs with the provisional settings" passes under `pnpm eval`.
- [ ] `pnpm check` passes with no network access and no embedding model in the cache.

**Validation.** The eval command, run by hand. The eval-time test under `pnpm eval` and in the eval job of FL-002, with the real embedder, a SQLite database and no LLM. The metric tests on every check.

**Completion evidence.** The commit with the eval and its data. The printed table of `pnpm eval:retrieval`, with the machine it ran on. The passing output of `pnpm check` and of `pnpm eval`.

### FL-057: Lane weights chosen by measurement

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-033 |
| Requirements | REQ-05 |
| Components | `apps/mcp-server` (evals), `@factloom/graph-rag` (default settings), `docs/architecture/adr` |

**Objective.** Run the retrieval eval for a fixed list of lane-weight variants, set the default settings of `recall` from the result, and record them in a new ADR.

**Background.** [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) left the lane weights undecided, and FL-031 uses provisional values: every weight 1 and a fusion constant of 60. In the [spike](../../../spikes/embedding-retrieval/README.md), equal-weight fusion of a keyword ranking and an embedding ranking scored below the embedding ranking alone at recall@1, and weighted fusion was not tried. FL-033 built the harness and measured the provisional settings. This item is the second part of the original FL-033, split off so that building the harness and deciding with it are separate sessions. Open questions Q-27 (the fusion constant and the number of candidates per lane) and Q-28 (whether the graph lane helps) are answered here as far as this set can answer them.

**Outcome.** `recall` has default settings chosen by measurement. A test under `pnpm eval` fails if the defaults stop meeting the bar. The next engineer reads the reason for each number in one ADR.

**Scope.**
- The list of variants, added to the eval of FL-033.
- The choice of default lane weights, lane list length and fusion constant, and the change of the settings constant of FL-031.
- A new ADR, and its row in [`DECISIONS.md`](../../architecture/DECISIONS.md).
- The test of the acceptance bar, under `pnpm eval`.

**Non-goals.**
- Changing the harness, the data or the metrics of FL-033.
- A larger set of statements, a comparison of embedding models, or a reranking model. A reranking model is listed under "Open decisions" of this epic and is considered only if these measurements show the merged ranking is not good enough.
- A parameter on the MCP tool for the settings.
- Tuning the weights on anything but this set. The ADR states that limit.

**Functional requirements.**
1. The list of variants is fixed in the eval before the first run of this item. It contains at least: the vector lane alone; the keyword lane alone; vector and keyword at equal weight; vector at weight 1 with keyword at each of 0.25 and 0.5; each of those with the graph lane at weight 0, 0.25, 0.5 and 1; and the chosen defaults with a fusion constant of 1 as well as 60.
2. The default settings of `recall` are set to the chosen variant.
3. **Acceptance bar.** With the default settings, hybrid recall must not score below the vector lane alone at recall@1 on this set. If it does, the ADR says why those defaults were chosen all the same.
4. A new ADR records: the variants and their numbers, the platform they were measured on (operating system, processor architecture, Node version and the embedding model's revision), the chosen lane weights, lane list length and fusion constant, the reason, and the limits of the measurement. It takes the next free number in `docs/architecture/adr/` and a row in `DECISIONS.md`. ADR 0017 is not edited.
5. The rows Q-27 and Q-28 of [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) are brought up to date with what was measured and what stays open.

**Technical requirements.**
1. The variants are data in `apps/mcp-server/evals/`, passed to the harness of FL-033. `pnpm eval:retrieval` prints one row for each.
2. The test of the bar runs under `pnpm eval`, not under `pnpm check`, because it needs the real embedding model. It runs two variants only, the defaults and the vector lane alone.
3. The default settings stay one typed constant in `@factloom/graph-rag`. The signature of `recall` does not change.
4. The numbers come from a real model whose floating-point output can differ between platforms, so they are recorded on one named platform, the runner of the eval job of FL-002. The committed expectation holds those numbers with a tolerance stated beside them, of at least one question in 40 (0.025) for recall@1 and recall@5. The test does not assert that two platforms give identical numbers.

**Constraints.**
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md).
- [`DECISIONS.md`](../../architecture/DECISIONS.md): a decision is changed by a new record, not by editing an old one.
- [`.claude/rules/engineering-principles.md`](../../../.claude/rules/engineering-principles.md), "Accuracy": a measured result is labelled confirmed and cites the run.

**Acceptance criteria.**
- [ ] `pnpm eval:retrieval` exits with code 0 and prints one row for each variant in requirement 1, with recall@1, recall@5 and MRR@10, and the same three numbers for each question group.
- [ ] A test named "the default settings meet the bar" passes under `pnpm eval`. It asserts that recall@1 with the defaults is not below recall@1 for the vector lane alone, both computed in the same run, and that the numbers for the defaults lie within the stated tolerance of those recorded in the ADR. If the ADR records an exception under requirement 3, the first assertion is replaced by the two recorded numbers with the tolerance, and the ADR section that gives the reason is named in the test.
- [ ] The eval job of FL-002, started by hand, passes with that test. Its address is recorded, and the platform it names equals the one in the ADR.
- [ ] The new ADR exists, is listed in `DECISIONS.md`, and its numbers equal the output of `pnpm eval:retrieval` on the named platform at the same commit.
- [ ] The unit tests of `recall` (FL-031) still pass with the new default settings.
- [ ] `pnpm check` passes.

**Validation.** The eval command, run to choose the defaults. The test of the bar under `pnpm eval` and in the eval job, with the real embedder, a SQLite database and no LLM.

**Completion evidence.** The commit or commits: the variants, the changed default settings, the new ADR. The printed table of `pnpm eval:retrieval` with its platform. The passing output of `pnpm check` and the address of the eval job run. The rows Q-27 and Q-28 as revised.
