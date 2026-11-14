# Local embeddings with bge-small-en-v1.5

Status: accepted

The default embedder is `BAAI/bge-small-en-v1.5`, run locally through Transformers.js: 384 dimensions, MIT licence, a 32 MB quantised model, no API key and no text leaving the machine. It sits behind the `Embedder` interface, and the model name and dimensions are stored with every vector.

Anthropic has no embedding model. A test on 60 code-memory statements and 40 questions did not separate this model from the larger `nomic-embed-text-v1.5` on retrieval quality: they differed by one query at recall@1, with most queries tied ([spike](../../../spikes/embedding-retrieval/README.md)). With quality equal within the limits of that test, the smaller model wins. Its vectors are also cheaper to scan, though not by half: at 100,000 rows the plain-table scan with the time filter took 121.3 ms at 768 dimensions and 82.0 ms at 384, about a third less ([measurement](../../../spikes/sqlite-vec-fts5/README.md)).

## Considered options

- **`nomic-embed-text-v1.5`, 768 dimensions.** Not better in the test, four times the model size, and needs a prefix on both statements and questions. Its longer input limit may matter for documents in phase 5.
- **A hosted model.** Rejected as the default: a second key, a network dependency, and memory text sent to a third party.
- **`all-MiniLM-L6-v2`.** It scored highest in the test by two queries, which is within noise. Kept in mind as the fallback.

## Consequences

- The test is small and was written by one author; it shows no difference, not equivalence.
- What was run is the `Xenova/bge-small-en-v1.5` ONNX conversion of the model, and its best score was with the model's query instruction in front of each question. The `Embedder` interface is told whether a text is a statement or a question for that reason.
- The runtime is heavy: the install measured 745 MB on Linux. If that proves a problem for users, the embedder can move to an optional package or a hosted default without a schema change.
- The model is English only and takes at most 512 tokens, which fits single statements.
- Changing model means re-embedding every statement, which the stored `statement` text makes possible.
