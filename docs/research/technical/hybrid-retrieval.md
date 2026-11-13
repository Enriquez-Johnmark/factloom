# Hybrid retrieval: vector, full-text and graph

Accessed: 2026-11-13.

## Question

Factloom retrieves facts by combining vector similarity, keyword search (SQLite FTS5) and graph
traversal, filtered by time. How should the three result lists be combined, is a reranker needed at
first, how should the graph be expanded, and should temporal filters run before or after ranking?

## Findings

### Rank fusion

1. **Reciprocal Rank Fusion (RRF) is a rank-only formula with one constant.** Cormack, Clarke and
   Büttcher, "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
   (SIGIR 2009, https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf):
   `RRFscore(d) = sum over rankings r of 1 / (k + r(d))`, "where k = 60 was fixed during a pilot
   investigation and not altered during subsequent validation". The pilot "indicated that k = 60 was
   near-optimal, but that the choice was not critical". The paper reports RRF beating Condorcet fuse,
   CombMNZ and the best individual system "by 4% to 5% on average" on TREC collections.
   **Confirmed** (PDF read). Note the setting: fusing many (30) runs of text search systems, not two
   or three heterogeneous retrievers.

2. **RRF needs no score normalisation.** It uses ranks only, so it can fuse a cosine distance, an
   FTS5 BM25 value and a hop count without making them comparable. **Confirmed** (follows from the
   formula).

3. **A tuned weighted sum can beat RRF, if there is data to tune it.** Bruch, Gai and Ingber, "An
   Analysis of Fusion Functions for Hybrid Retrieval" (2022, https://arxiv.org/abs/2210.11934): "we
   find RRF to be sensitive to its parameters; that the learning of a CC [convex combination] fusion
   is generally agnostic to the choice of score normalization; that CC outperforms RRF in in-domain
   and out-of-domain settings; and ... that CC is sample efficient, requiring only a small set of
   training examples". **Confirmed** (abstract). The practical reading: RRF is the right default
   with no labelled queries; a weighted sum becomes worth it once an evaluation set exists.

4. **FTS5 `bm25()` returns smaller values for better matches.** SQLite documentation: "The better
   the match, the numerically smaller the value returned", and results are ordered with
   `ORDER BY bm25(ft)` or `ORDER BY rank`. Per-column weights are passed as extra arguments, for
   example `bm25(ft, 10.0, 5.0)`. Source: https://www.sqlite.org/fts5.html. **Confirmed**, and
   reproduced on SQLite 3.53.1: matches returned negative scores with the best match most negative.
   A weighted-sum fusion would have to negate and normalise this value; RRF does not care.

### What existing systems do

5. **Graphiti: three search methods, five rerankers.** Edge and node search methods are
   `cosine_similarity`, `bm25` and `breadth_first_search`; rerankers are `reciprocal_rank_fusion`,
   `node_distance`, `episode_mentions`, `mmr` and `cross_encoder`. Each method fetches `2 * limit`
   candidates; default limit 10; default similarity floor 0.6; default BFS depth 3; default MMR
   lambda 0.5. Source: `graphiti_core/search/search_config.py`, `search_utils.py`, `search.py` at
   commit `ebef986a` (2026-11-11). **Confirmed.** The Zep paper describes the same design and says
   the three methods target "word similarities", "semantic similarities" and "contextual
   similarities" respectively (https://arxiv.org/abs/2501.13956). **Confirmed.**

6. **Graphiti's RRF uses a rank constant of 1, not 60.** `def rrf(results, rank_const=1, min_score=0)`
   computes `1 / (i + rank_const)` with zero-based `i`. Source: `graphiti_core/search/search_utils.py`.
   **Confirmed.** With short lists (20 candidates each) a small constant weights the top ranks much
   more heavily than k = 60 does. No published comparison of the two settings on memory retrieval was
   found. **Unverified** which is better for Factloom.

7. **Graphiti's default fact search is BM25 plus cosine fused by RRF, with no graph step.**
   `Graphiti.search` uses `EDGE_HYBRID_SEARCH_RRF` (methods: bm25, cosine_similarity; reranker: rrf),
   or the node-distance variant when the caller passes a centre node. The advanced `search_` method
   defaults to `COMBINED_HYBRID_SEARCH_CROSS_ENCODER`. Source: `graphiti_core/graphiti.py`,
   `search_config_recipes.py`. **Confirmed.**

8. **Graphiti's graph step is breadth-first expansion from seeds.** When BFS is enabled and the
   caller gives no origin nodes, the source nodes of the edges found by the other methods become the
   BFS origins, and the BFS results are added as one more ranked list before fusion. Source:
   `graphiti_core/search/search.py`, `edge_search`. **Confirmed.**

9. **Graphiti applies filters inside each search query.** `SearchFilters` carries `valid_at`,
   `invalid_at`, `created_at` and `expired_at` date filters (lists of AND-groups joined by OR) that
   are compiled into the `WHERE` clause of the full-text, similarity and BFS queries, so filtering
   happens before ranking and before the candidate limit. Source:
   `graphiti_core/search/search_filters.py`, `search_utils.py`. **Confirmed.** The default
   `SearchFilters()` has no date filter, so invalidated edges are returned unless the caller filters
   them. **Confirmed.**

10. **Mem0 uses an additive score rather than RRF.** In version 2.2.1 (`f1791daa`), search
    over-fetches semantic results (`max(limit * 4, 60)`), computes a sigmoid-normalised BM25 score for
    keyword hits and an entity boost (weight 0.5), then ranks by
    `(semantic + bm25 + entity_boost) / max_possible`. A threshold "gates the semantic score BEFORE
    combining": a candidate below it is dropped even if keywords match. Source:
    `mem0/memory/main.py`, `mem0/utils/scoring.py`. **Confirmed.** Consequence: a document found only
    by keyword search cannot be returned. **Confirmed** from the code (candidates are built from
    semantic results only).

### Rerankers

11. **Cross-encoder reranking is the most expensive option in Graphiti by its authors' own
    description**: it "incurs the highest computational cost" (Zep paper, section on rerankers).
    **Confirmed.** In code it runs over the top `2 * limit` RRF results. **Confirmed.**

12. **MMR trades relevance against redundancy.** Graphiti's implementation scores each candidate as
    `lambda * sim(query, c) + (lambda - 1) * max_sim(c, others)`. Source: `search_utils.py`,
    `maximal_marginal_relevance`. **Confirmed.** The original method is attributed by the Zep paper
    to Carbonell and Goldstein; that 1998 paper was not fetched. **Likely.**

13. **No reviewed source isolates the benefit of a reranker on memory benchmarks.** The Zep paper
    reports end-to-end results only. **Confirmed** absence in the papers read.

### Graph expansion

14. **N-hop expansion works in SQLite with a recursive CTE.** Tested on SQLite 3.53.1: an undirected
    2-hop expansion over an indexed `edge(src, dst)` table using `WITH RECURSIVE ... UNION` returned
    each reachable node with its minimum depth; `UNION` (not `UNION ALL`) removes repeated rows, which
    keeps cycles from looping within the depth bound. Documentation:
    https://www.sqlite.org/lang_with.html. **Confirmed** by test on a toy graph; cost on hub nodes
    with thousands of edges is **unverified**.

15. **Personalized PageRank (PPR) is the main published alternative to fixed-hop expansion.**
    HippoRAG "identifies the key concepts in the query and runs the Personalized PageRank (PPR)
    algorithm on the KG, using the query concepts as the seeds", with a damping factor of 0.5 in the
    reported settings. Gutiérrez, Shu, Gu, Yasunaga and Su (NeurIPS 2024,
    https://arxiv.org/abs/2405.14831). **Confirmed.** The follow-up, "From RAG to Memory:
    Non-Parametric Continual Learning for Large Language Models" (ICML 2025,
    https://arxiv.org/abs/2502.14802), keeps PPR and notes that earlier graph-augmented approaches
    dropped "considerably below standard RAG" on basic factual memory tasks. **Confirmed**
    (abstract). PPR needs an iterative computation over the whole graph in application memory or an
    extension; SQLite has no built-in for it. **Likely** (no such function appears in the SQLite
    documentation pages read; extensions were not surveyed).

16. **HippoRAG's evaluation is multi-hop question answering over static corpora**, not evolving
    conversational or project memory. **Confirmed** (paper). Its advantage for Factloom's first use
    case is therefore **unverified**.

### Temporal filters: before or after ranking

17. **Post-filtering a top-k list can return too few results.** If the ranker returns k candidates
    and the filter then removes invalidated or out-of-period facts, fewer than k remain, possibly
    none, even though valid matches exist further down. This follows from the arithmetic and is the
    reason Graphiti filters inside the query (finding 9). **Likely** (reasoning; not measured).
    The effect grows with the share of invalidated facts, which in an "invalidate, never delete"
    store only increases over time.

18. **LongMemEval reports gains from time-aware retrieval.** Wu et al. propose "a simple indexing and
    query expansion strategy to explicitly associate timestamps with facts and narrow down the search
    range, improving the memory recall for temporal reasoning by 6.8% [to] 11.3% when a strong LLM is
    employed for query expansion" (ICLR 2025, https://arxiv.org/abs/2410.10813). **Confirmed.**

## What it means for Factloom

Recommended phase 1 pipeline:

| Step | What | Notes |
|---|---|---|
| 1. Filter | Build one SQL predicate from namespace, `invalidated_at IS NULL` (or `knownAt`), and the valid-time clause (now, or `validAt`) | Applied inside every retriever, never afterwards |
| 2a. Keyword | FTS5 `MATCH`, `ORDER BY rank`, top N | Join to the fact table for step 1 |
| 2b. Vector | Vector top N over fact text | If the vector index cannot pre-filter, over-fetch (for example 5x) and filter, and log when fewer than N survive |
| 2c. Graph | Entities mentioned in the query (exact/alias lookup) plus subject entities of the top hits from 2a/2b become seeds; 1-hop facts around the seeds, ranked by hop count then recency | Recursive CTE; depth 1 by default, 2 as an option |
| 3. Fuse | RRF over the lists that are present | `score = sum 1 / (k + rank)`, rank starting at 1 |
| 4. Return | Top `limit` (default 10), each with its per-list ranks | Keeping per-list ranks makes results explainable and tunable |

Specific choices:

1. **RRF with k = 60 as the starting constant**, exposed as a config value. It is the published
   default; Graphiti's k = 1 is the other reference point. Choose between them with the evaluation
   set rather than by argument.
2. **N = 3 x limit candidates per retriever** as a starting point (Graphiti uses 2x, Mem0 at least
   4x). Unverified which is best; cheap to tune.
3. **Let keyword-only hits through.** Identifiers (function names, error codes, file paths) are
   exactly what embeddings miss; do not gate on semantic score the way Mem0's scorer does.
4. **Pre-filter by time.** Default is "currently believed and currently true". Historical queries
   pass `validAt` and/or `knownAt`. Invalidated facts are never ranked unless asked for.
5. **Graph expansion is a retriever, not a post-processing step.** Treating its output as a third
   ranked list keeps fusion uniform and makes it trivial to switch off when measuring its value.
6. **One retrieval interface in `packages/graph-rag`**, with each retriever returning
   `{ factId, rank }[]`, so that Postgres (tsvector or pg_search, pgvector, recursive CTE) can replace
   the internals later without changing fusion.

Do not build yet:

- A cross-encoder or LLM reranker. It adds latency and a model dependency, and there is no evidence
  yet that fused ranking is the bottleneck. Add only if the evaluation set shows relevant facts
  retrieved but ranked below the cut.
- MMR. Deduplication at write time should remove most near-duplicates; revisit if results are
  visibly redundant.
- Personalized PageRank, community detection and community summaries.
- Weighted score fusion. Revisit after there are at least a few dozen labelled queries (finding 3).
- Query rewriting or LLM query expansion, except extracting an explicit date from the query into
  `validAt`, which can start as a parameter the calling agent fills in.

## Open questions

- **Unverified:** k = 60 versus k = 1 (or anything between) for fusing two or three short lists.
- **Unverified:** whether graph expansion improves answer quality for coding-agent memory at all.
  Measure with it on and off.
- **Unverified:** recursive CTE cost on hub entities (for example a repository entity linked to
  every fact). A per-seed fan-out cap is probably needed; pick the number from measurements.
- **Unverified:** whether the chosen SQLite vector extension can apply the step 1 predicate during
  the nearest-neighbour search. This belongs to the storage research; the pipeline above works either
  way but over-fetch factors depend on it.
- Should recency be a fourth ranked list or a tie-breaker? See memory-decay-and-consolidation.md;
  the recommendation there is tie-breaker only at first.
