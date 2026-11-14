# Every row belongs to a namespace

Status: accepted

Entities, sources, facts and audit entries each carry a `namespace`, and every query filters on it. Nothing is read or linked across namespaces. The MCP server takes its namespace from configuration, so tools do not accept one. The namespace is required configuration with no default: the server refuses to start without it and says why. The default database is one file per user, so a default namespace would put every repository that user works in into the same memory.

It is in the first migration because it is the one piece of multi-tenancy that cannot be added cheaply: retrofitting it means changing every query and every method of the storage interface. Phase 1 already uses it, to keep one repository's memory apart from another's in the same file.

## Considered options

- **One database file per repository and no column.** Rejected: it does not carry over to Postgres, and it rules out one file holding both a repository's memory and a user's.
- **Access control per fact now.** Rejected: nothing needs it before the regulated domains in phase 5 and later, and it can be layered on namespaces.
