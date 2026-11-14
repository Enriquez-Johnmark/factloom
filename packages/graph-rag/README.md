# @factloom/graph-rag

Product 1, temporal graph RAG. It holds the use cases: `remember`, `recordStructuredFacts`, `changeFact`, `recall` and `getFactHistory`, with rank fusion and the software development domain.

It imports `@factloom/core` only. It reaches storage, the LLM and embeddings through the interfaces in core, never through a concrete library.

**Status:** scaffold only. The export in `src/index.ts` is a placeholder.

- Design: the "Use cases" section of [`docs/architecture/INTERFACES.md`](../../docs/architecture/INTERFACES.md)
- Work items: [`EPIC-04`](../../docs/roadmap/epics/EPIC-04.md) and [`EPIC-05`](../../docs/roadmap/epics/EPIC-05.md)
