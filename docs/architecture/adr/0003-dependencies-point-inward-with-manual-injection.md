# Dependencies point inward and are passed as arguments

Status: accepted

`core` owns the interfaces for storage, the LLM client and embeddings. Outer packages implement them. A use case receives the implementations it needs as its first argument, and the only place that names a concrete implementation is the composition root in each app.

This keeps every use case testable with fakes and lets Postgres, another LLM provider or another embedder be added without touching `core` or `graph-rag`.

## Considered options

- **A dependency injection container.** Rejected: with one app and a handful of dependencies, a container adds indirection and decorators and removes nothing. Passing arguments is visible in the code and checked by the compiler.
- **Importing concrete clients where they are used.** Rejected: use cases would need a database and an API key to be tested.
