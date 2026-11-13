# One commit method writes facts, sources, embeddings and audit entries

Status: accepted

The storage interface has one write method, `commit(changeSet)`. A change set is a list of changes as plain data: create an entity, record a source, record a fact, attach a source, invalidate a fact. The store applies all of them or none, in order, and writes one audit entry per change itself.

Two rules follow from this shape without anyone having to remember them. A change cannot be made without an audit entry, because no method writes one without the other. And a succession or a correction cannot be left half done, because its rows are one commit.

The same shape is what later phases need. A change set that product 2 proposes and a person approves is the same data whether it is applied now or held in a queue.

## Considered options

- **A method per table, with a transaction handle passed around.** Rejected: `better-sqlite3` is synchronous and its transactions cannot stay open across an `await`, while the interface must be asynchronous for Postgres. A coarse method avoids exposing a handle that only one adapter could honour.
- **Separate stores for facts, entities and the audit log.** Rejected: the first thing every write needs is to be atomic across all of them.
- **Callers write audit entries.** Rejected: an entry would be forgotten the first time someone added an operation in a hurry.
