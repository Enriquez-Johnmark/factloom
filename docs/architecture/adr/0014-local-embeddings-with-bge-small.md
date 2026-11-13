# Local embeddings with bge-small-en-v1.5

Status: accepted

The default embedder is `BAAI/bge-small-en-v1.5`, run locally through Transformers.js: 384 dimensions, MIT licence, a 32 MB quantised model, no API key and no text leaving the machine. It sits behind the `Embedder` interface, and the model name and dimensions are stored with every vector.

Anthropic has no embedding model. A test on 60 code-memory statements and 40 questions did not separate this model from the larger `nomic-embed-text-v1.5` on retrieval quality: they differed by one query at recall@1, with most queries tied ([spike](../../../spikes/embedding-retrieval/README.md)). With quality equal within the limits of that test, the smaller and faster model wins, and half the dimensions halves the cost of every vector scan.

## Considered options

- **`nomic-embed-text-v1.5`, 768 dimensions.** Not better in the test, four times the model size, and needs prefixes. Its longer input limit may matter for documents in phase 5.
- **A hosted model.** Rejected as the default: a second key, a network dependency, and memory text sent to a third party.
- **`all-MiniLM-L6-v2`.** It scored highest in the test by two queries, which is within noise. Kept in mind as the fallback.

## Consequences

- The test is small and was written by one author; it shows no difference, not equivalence.
- The runtime is heavy: the install measured 745 MB on Linux. If that proves a problem for users, the embedder can move to an optional package or a hosted default without a schema change.
- The model is English only and takes at most 512 tokens, which fits single statements.
- Changing model means re-embedding every statement, which the stored `statement` text makes possible.
