# Purge is the one exception to keeping everything

Status: accepted

Factloom invalidates and never deletes. The single exception is a purge: a rare, audited operation that removes the content of a source or a fact and leaves a record that it existed, with the time and the reason.

Two cases require it. Data-protection law gives people a right to erasure, and guidance for append-only stores says technical impossibility is not an excuse ([research](../../research/industries/other-industries.md); the regulation texts were read from mirrors and are listed as unverified). And in ordinary use, an agent will sooner or later store a secret by mistake.

## Decision details

- Purge is a separate operation with its own audit action, never a side effect of anything else.
- It replaces content fields with a marker value and removes the keyword and vector entries. The row, its identifiers, its timestamps and its audit entries stay.
- The audit log holds no free text. An entry explains a change with a reason code from a fixed list and the identifier of a source, and the words of the explanation are the content of that source. An agent's free-text reason is stored as a source of kind `agent_note`. The `detail` JSON of an entry is restricted to identifiers and numbers by the core schema; the database checks only that it is valid JSON. This is in the first migration, because it is the part that could not be added later: the log's rows can never be changed.
- The operation itself is a phase 2 work item. Only the audit log rule above is built in phase 1.

## What the phase 2 design must cover

A review of this design found that removing the content of one row is not enough. The operation must:

- cover every copy of a purged fact. A revision copies the statement into a new row, so the same text is in each fact linked to it by supersession;
- remove the keyword entry and the vector entry of each of those rows. The keyword index is an external-content FTS5 index, and removing an entry from it needs the old text, so the entry is removed in the same step that replaces the text;
- write a marker value, not `NULL`, into `object_value`. The `CHECK` on the object columns requires exactly one of `object_entity_id` and `object_value` to be set, so `NULL` is refused;
- clear the source's `locator` as well as its `content`, because a path or a URL can itself be the sensitive part;
- purge the content of every source that explained a change to those facts, such as the `agent_note` that says why a fact was wrong, because that note often quotes the value.

It also needs a narrowly permitted change in the triggers on `fact` and `source`, which in the first migration refuse every update of content.

Not yet decided, and listed here so that they are not forgotten: what happens to the name of an entity that is itself the sensitive value, and whether a purge also clears the freed pages of the database file.

## Considered options

- **No exception.** Rejected: it would make Factloom unusable for personal data and unable to remove a leaked credential.
- **Ordinary deletion.** Rejected: it would break supersession links and make the audit log refer to rows that no longer exist.
