# One commit method writes facts, sources, embeddings and audit entries

Status: accepted

The storage interface has one write method, `commit(changeSet)`. A change set is a list of changes as plain data: create an entity, record a source, record a fact, attach a source, invalidate a fact. The store applies all of them or none, in order, and writes one audit entry per change itself. A change is one item of the list, not one database row: recording a fact inserts its row, its source links and its embedding, and gets one entry.

Two rules follow from this shape without anyone having to remember them. A change cannot be made without an audit entry, because no method writes one without the other. And a succession or a correction cannot be left half done, because its rows are one commit.

The commit also enforces the single-value rule, inside the same transaction and after applying the changes: for a single-valued predicate, no two live facts with the same subject and predicate may overlap in valid time. A commit that would break it fails with `conflict`. The check is in the store, not in the caller before the commit, because each host session starts its own server process and several can share one database file. A check made before the commit could pass in two processes at once. The store still decides nothing: the change says whether its predicate is single-valued, and the store only refuses.

The same shape is what later phases need. A change that product 2 proposes for a person's approval is held as the operation's input, plain data, and becomes a change set when it is approved, so its recorded time is the time of approval.

## Considered options

- **A method per table, with a transaction handle passed around.** Rejected: `better-sqlite3` is synchronous and its transactions cannot stay open across an `await`, while the interface must be asynchronous for Postgres. A coarse method avoids exposing a handle that only one adapter could honour.
- **Separate stores for facts, entities and the audit log.** Rejected: the first thing every write needs is to be atomic across all of them.
- **Callers write audit entries.** Rejected: an entry would be forgotten the first time someone added an operation in a hurry.
