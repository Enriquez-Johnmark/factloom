# Purge is the one exception to keeping everything

Status: accepted

Factloom invalidates and never deletes. The single exception is a purge: a rare, audited operation that removes the content of a source or a fact and leaves a record that it existed, with the time and the reason.

Two cases require it. Data-protection law gives people a right to erasure, and guidance for append-only stores says technical impossibility is not an excuse ([research](../../research/industries/other-industries.md); the regulation texts were read from mirrors and are listed as unverified). And in ordinary use, an agent will sooner or later store a secret by mistake.

## Decision details

- Purge is a separate operation with its own audit action, never a side effect of anything else.
- It blanks content fields and removes the keyword and vector entries. The row, its identifiers, its timestamps and its audit entries stay.
- The audit log never holds fact or source text, only identifiers and reasons. That is in the first migration, because it is the part that could not be added later.
- The operation itself is built in phase 2.

## Considered options

- **No exception.** Rejected: it would make Factloom unusable for personal data and unable to remove a leaked credential.
- **Ordinary deletion.** Rejected: it would break supersession links and make the audit log refer to rows that no longer exist.
