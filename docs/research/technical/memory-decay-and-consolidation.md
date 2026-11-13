# Memory decay and consolidation

Accessed: 2026-11-13.

## Question

Should Factloom make old or unused memories count for less, archive them, or summarise them? What do
published systems do, what can go wrong, and which signals must be recorded from the first release so
that a policy can be added later without guessing?

Terms: *decay* lowers a memory's retrieval score over time; *archiving* removes it from default
retrieval without deleting it; *consolidation* rewrites several memories into fewer, more general
ones.

## Findings

### Scoring by recency, importance and relevance

1. **Generative Agents combines three normalised scores with equal weights.** Park, O'Brien, Cai,
   Morris, Liang and Bernstein, "Generative Agents: Interactive Simulacra of Human Behavior" (2023,
   https://arxiv.org/abs/2304.03442). Retrieval score:
   `score = a_recency * recency + a_importance * importance + a_relevance * relevance`, each term
   min-max scaled, and "in our implementation, all [weights] are set to 1". **Confirmed.**

   | Term | Definition in the paper |
   |---|---|
   | Recency | "an exponential decay function over the number of sandbox game hours since the memory was last retrieved"; decay factor 0.995 |
   | Importance | An integer the LLM assigns when the memory is created ("directly asking the language model to output an integer score") |
   | Relevance | Embedding similarity between the memory and a query memory |

2. **Recency there is measured from last retrieval, not from creation.** See the quote in finding 1.
   **Confirmed.** A memory that keeps being used stays fresh; this requires recording a
   last-accessed time on every retrieval.

3. **The paper's setting is a simulation of believable behaviour, not factual recall.** Its
   evaluations measure believability of agent behaviour. **Confirmed** (paper). Whether the scoring
   helps a store whose purpose is to return correct facts is **unverified**; the paper does not claim
   it.

### Forgetting curves

4. **MemoryBank applies an Ebbinghaus-style exponential curve.** Zhong, Guo, Gao, Ye and Wang,
   "MemoryBank: Enhancing Large Language Models with Long-Term Memory" (2023,
   https://arxiv.org/abs/2305.10250): retention `R = e^(-t/S)`, where `t` is time since the memory
   was learned and `S` is memory strength. `S` starts at 1 on first mention; when a memory is recalled
   "we increase S by 1 and reset t to 0, hence forget it with a lower probability". **Confirmed.**

5. **The authors describe it as a simplification.** "It is important to note that this is an
   exploratory and highly simplified memory updating model." **Confirmed** (same paper). The stated
   motivation is a more human-like companion chatbot ("mimic anthropomorphic behaviors"), not
   accuracy of stored knowledge. **Confirmed.**

### Usage signals in graph memory systems

6. **Graphiti has no time decay; it has a mention-count reranker.** The `episode_mentions` reranker
   orders results by how many episodes mention them (a `count(*)` over mentioning episodes); the Zep
   paper describes it as "enabling a system where frequently referenced information becomes more
   readily accessible". Source: `graphiti_core/search/search_utils.py` at commit `ebef986a`
   (2026-11-11); https://arxiv.org/abs/2501.13956. **Confirmed.** Edges carry no access counter or
   last-accessed field (fields listed in bi-temporal-modelling.md). **Confirmed.** Staleness is
   handled by invalidation, that is, by evidence rather than by age.

7. **Mem0's open-source library supports explicit expiry, not decay; the hosted Platform has an
   opt-in retrieval-based decay factor.** The Platform's "Memory Decay" multiplies search scores
   by 0.3x to 1.5x from how recently and how often a memory was retrieved, is off by default and
   never filters (`docs/platform/features/memory-decay.mdx`; **confirmed** in documentation, not
   run; see `../evaluations/mem0.md`). In the library, a memory payload may carry an `expiration_date`;
   search skips expired memories unless `show_expired` is set. Source: `mem0/memory/main.py`
   (`_payload_is_expired`, `_search_vector_store`) at commit `f1791daa` (2026-11-06, version 2.2.1).
   **Confirmed.** No recency term appears in its scoring function (`mem0/utils/scoring.py`:
   semantic + BM25 + entity boost). **Confirmed.**

### Consolidation and background processing

8. **Sleep-time compute moves reasoning to idle time.** Lin, Snell, Wang, Packer, Wooders, Stoica
   and Gonzalez, "Sleep-time Compute: Beyond Inference Scaling at Test-time" (2025,
   https://arxiv.org/abs/2504.13171): models "think" offline about a context before queries arrive;
   on the paper's modified reasoning benchmarks this reduced test-time compute for equal accuracy by
   about 5x, and the benefit correlated with "the predictability of the user query". **Confirmed**
   (abstract). The evaluation is on reasoning tasks (Stateful GSM-Symbolic, Stateful AIME) plus a
   software engineering case study, not on long-term fact stores. **Confirmed.**

9. **Letta ships background memory consolidation as a product feature.** Its documentation
   ("Memory & dreaming") says: "Dreaming uses background subagents to review recent conversations,
   consolidate useful lessons, and update memory without interrupting your active work", triggered
   "after a set number of completed agent steps or when the context window is compacted"; a larger
   reorganisation "backs up the current repository before splitting large files, merging duplicates,
   or restructuring the hierarchy". Source:
   https://docs.letta.com/guides/agents/architectures/sleeptime (page title on the access date:
   "Memory & dreaming | Letta Docs"). **Confirmed** for what the page states. Note the backup before
   reorganising: the vendor treats consolidation as an operation that needs an undo.

10. **Generative Agents consolidates through "reflections"**: higher-level statements generated
    when the summed importance of recent events passes a threshold (150 in the paper), stored as new
    memories alongside the originals. **Confirmed** (same paper as finding 1). The originals are kept.

11. **Summaries lose detail that questions later need.** LongMemEval (Wu et al., ICLR 2025,
    https://arxiv.org/abs/2410.10813) compares storage granularities and reports that "replacing
    sessions or rounds with extracted summaries or facts negatively impacts QA performance due to
    information loss", with multi-session reasoning as the exception, and recommends using extracted
    facts to expand the retrieval key while keeping the original text as the value. **Confirmed.**

12. **Removing outdated information is measurably hard.** MemoryAgentBench (Hu, Wang and McAuley,
    2025, https://arxiv.org/abs/2507.05257) includes a "selective forgetting" competency ("revise,
    overwrite, or remove previously stored information when faced with contradictory evidence") and
    reports that "all methods fail on the multi-hop situation (with achieving at most 28% accuracy)".
    **Confirmed.** This is about forgetting because of evidence, which is Factloom's invalidation
    path, not about forgetting because of age.

### Risks

| Risk | Why it matters | Basis |
|---|---|---|
| A true but rarely used fact is demoted or archived | Rare facts are often the valuable ones (a one-off decision, an incident cause, a licence constraint); usage frequency is not truth | Reasoning; no reviewed paper claims decay improves factual accuracy (findings 3, 5), and the Mem0 Platform page describes its decay as a ranking bias without an accuracy figure (finding 7). **Likely** |
| Decay hides the correct answer to a historical question | "What was true in 2024" needs old facts at full strength | Follows from Factloom's own requirements. **Likely** |
| Consolidation destroys provenance | A summary has many sources; a wrong summary cannot be traced to one | Finding 11; Letta's backup step in finding 9. **Likely** |
| Feedback loop | Facts that rank high get accessed, which makes them rank higher | Follows from findings 2 and 4. **Likely** |
| Read path becomes a write path | Recording access on every retrieval adds writes and lock contention in SQLite | Reasoning; not measured. **Unverified** |

No reviewed paper measures the rate at which a decay or archiving policy removes facts that were
later needed. **Confirmed** absence in the sources read.

## What it means for Factloom

Position: in a bi-temporal store, **time-based forgetting is mostly the wrong tool**. A fact stops
being returned because evidence invalidated it or its valid period ended, not because it is old.
Decay and archiving are about ranking and tidiness, and should never change what the system believes.

Simplest defensible policy, by phase:

| Phase | Policy |
|---|---|
| 1 (retrieval) | No decay. Recency is a tie-breaker only: among equal fused ranks prefer the later `valid_from`, then the later `created_at`. Record the signals below. |
| 2 (self-correction) | Unchanged. Staleness is handled by invalidation. |
| 3 (self-healing) | **Archiving by rule, reversible.** A fact becomes `archived` only if all hold: never accessed, or not accessed for a long configurable period (start with 180 days); older than that period; not the only live fact for its subject and predicate; not pinned; adapter policy allows it. Archived facts are excluded from default retrieval and still returned by historical or explicit `includeArchived` queries. Any access un-archives. |
| 3 (self-healing) | **Re-verification before archiving, where a source exists**: an old, low-confidence, unused fact is first checked against its source; only facts that can be neither confirmed nor refuted are archived. |
| Later, only with evidence | A recency term in ranking, tuned on the evaluation set. |

Archiving is a state on a side table, not a change to the fact row and not an invalidation:
`invalidated_at` means "we no longer believe this"; `archived_at` means "we still believe this but
stopped offering it by default". Mixing the two would corrupt "as known at" queries.

Signals to record from day one (cheap now, impossible to reconstruct later). An independent
review questioned whether anything other than access history needs recording before phase 3; that
is recorded as open in `../OPEN-QUESTIONS.md`, section C.

| Signal | Where | Why |
|---|---|---|
| `last_accessed_at`, `access_count` | Side table `fact_usage(fact_id, ...)`, so fact rows stay immutable | Inputs to any later recency or archiving rule (findings 2, 4) |
| `last_returned_rank` or a sampled retrieval log `(query_id, fact_id, rank, retriever, ts)` | Append-only table, optionally sampled | Separates "matched" from "actually shown"; lets ranking changes be replayed offline |
| `source_count` (number of distinct sources asserting the fact) | Derived from fact-to-source links | Corroboration signal; Graphiti's mention count is the analogue (finding 6) |
| `confidence` at extraction and `last_verified_at` | Fact row (confidence) and side table (verification) | Drives re-verification order in phase 3 |
| Explicit feedback events (confirmed / wrong / unhelpful) | Audit log | The only signal that reflects truth rather than popularity |
| `pinned` flag | Side table | Lets a user or adapter exempt facts from archiving |

Implementation notes:

1. Count an access when a fact is returned to the caller, not when it is merely a candidate.
2. Update usage in one batched statement per retrieval call, after the response is produced; a lost
   update is acceptable.
3. Do not ask the LLM for an "importance" score at write time yet. It costs tokens on every fact and
   there is no evidence it predicts usefulness for factual stores (finding 3). The `confidence` field
   and source count cover the immediate needs.

Do not build yet:

- Exponential decay, forgetting curves or strength counters in ranking.
- Summarisation that replaces facts, "reflection" facts, or community summaries. If summaries are
  added later they are new derived records that point at their inputs; inputs stay (findings 10, 11).
- Background "sleep-time" agents beyond the scheduled self-healing jobs already planned for phase 3.
- Hard deletion or compaction of archived or invalidated rows. Storage growth is not a problem at
  the scale of one developer's projects; measure before acting.
- Per-fact time-to-live. If an adapter needs expiry (for example a regulatory retention limit), model
  it as an explicit `valid_to` or as a policy job, not as a ranking feature.

## Open questions

- **Unverified:** whether any recency term improves answer accuracy for coding-agent memory. Test by
  replaying logged queries once an evaluation set exists.
- **Unverified:** write contention from usage updates under SQLite WAL mode with concurrent MCP
  clients. Measure in phase 1; fall back to sampling or an in-memory buffer flushed periodically.
- What is a sensible archiving period for code memory, where a repository may be untouched for a
  year and then revived? 180 days is a placeholder, not a finding.
- Retention and deletion obligations in regulated adapters (legal, healthcare) may conflict with
  "invalidate, never delete". That is a policy question for phase 6 and is not answered here; the
  related purge question is `../OPEN-QUESTIONS.md`, D-10.
- Should archived facts be removed from the vector and full-text indexes to keep them small, or only
  filtered at query time? Decide from index size measurements.
