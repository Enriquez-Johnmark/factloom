# Rank fusion in TypeScript, with the time filter inside each lane

Status: accepted

Recall runs three retrieval lanes, vector, keyword and graph. Each lane applies the time filter in its own query and returns a ranked list. The lists are merged by weighted reciprocal rank fusion in a pure TypeScript function in `graph-rag`.

Fusing ranks, not scores, is what lets the lanes differ: cosine distance, BM25 and graph distance are not comparable numbers, and Postgres ranks text differently from SQLite. Keeping the fusion out of SQL makes it testable without a database and identical for every storage adapter. Filtering inside each lane means no lane spends its limit on facts the filter would discard.

## The lane weights are not yet decided

In a small test, fusing a keyword lane with an embedding lane at equal weight scored *below* the embedding lane alone at recall@1, because the keyword lane votes with equal strength on natural-language questions where it is often wrong ([spike](../../../spikes/embedding-retrieval/README.md)). The way the lists were fused moved the result more than the choice of embedding model did.

The lane weights and list lengths are therefore parameters, and their defaults are set in phase 1 by a retrieval eval, not here. The keyword lane stays because it is what finds identifiers, paths and version numbers.

## Considered options

- **One SQL statement that fuses the lanes.** It ran in a spike. Rejected: dialect-specific and hard to test.
- **A reranking model.** Rejected for now: another model to run, with no evidence yet that it is needed.
- **Graph expansion over several steps.** Phase 1 uses one step from the entities the other lanes found, ranking each fact by how many of those entities it touches and then by how recently it was recorded. Its value for coding-agent memory is unverified, and the retrieval eval measures it along with the lane weights.
