# Built from scratch, not on an existing memory project

Status: accepted

Factloom does not fork, wrap or build on an existing memory system. Existing systems were studied instead ([competitive analysis](../../research/evaluations/competitive-analysis.md)), and their strengths became requirements.

The reason is the data model. The rules Factloom is built around, facts that change only by invalidation, a link from each superseded fact to its replacement, an audit entry for every change, are properties of the storage layer. As of 2026-11-13, in the versions studied, the competitive analysis records the following.

- **Graphiti 0.31.2** has bi-temporal fact edges and invalidates a contradicted fact without deleting it. It keeps no link to the replacement and no audit log, and it needs a graph database.
- **Memwright 2.0.6** has a valid period on each fact and links a superseded fact to its replacement. It is not bi-temporal and keeps no change log.
- **Attestor 4.1.11**, the same project after it was renamed, has bi-temporal columns. It has no general change log and no mode that runs without separate database services. It was read in source, not run.
- **The Zep service** documents the same four time fields as Graphiti. It is hosted, was not run, and nothing else about it was established.
- **The Mem0 Platform** documents a link from a superseded memory to its replacement. It is a hosted service and was not run. The Mem0 library 2.2.1 keeps a history per memory and has record time only.
- **Letta Code, Cognee, Mnemograph, the MCP reference memory server and the built-in memories of Claude Code and Codex** have no valid period.

None of those studied combines insert-only bi-temporal facts, a link to the superseding fact and a per-change audit log in a single local file. Adding these rules on top of a system that does not have them would mean replacing its storage.

## Consequences

Everything those projects already have must be built: extraction, entity resolution, retrieval. The competitive analysis records where they are ahead today.
