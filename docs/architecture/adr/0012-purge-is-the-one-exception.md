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

Two questions were left open here, the name of an entity that is itself the sensitive value and the freed pages of the database file. The design below answers both.

## The phase 2 design (FL-047)

Completed on 2026-11-17. Each answer is labelled **confirmed** (run in the [purge spike](../../../spikes/purge/README.md), or read on a primary source), **likely**, or **unverified**. The spike ran on SQLite 3.54.1 through `better-sqlite3` 13.1.1, with `sqlite-vec` 0.1.9, on a database built from the project's migrations `0001` to `0003` and the draft `spikes/purge/0004_purge.sql`. FL-061 implements this; FL-072 builds the command.

**Names.** The operation is `purge`, with the reason codes `erasure_requested` and `secret_stored` and the trigger `person`. One change kind, `purge_content`, names a target by kind and identifier, `{ kind: 'purge_content', targetKind: 'source' | 'fact', targetId }`. Its audit action is `source.purged` or `fact.purged`, by target kind, and its `detail` is `null`. A live fact that is purged is first invalidated by an `invalidate_fact` change in the same change set. `Fact` and `Source` gain `purgedAt: Timestamp | null`.

1. **Which facts a purge covers.** A purge names one source, the target. Let **P** be the target and every source in the namespace with the same content hash (question 2).
   - The covered facts start as those whose every source is in P: a fact with another source is kept, as `INTERFACES.md` says.
   - Then every *copy* of a covered fact is added, repeatedly. A copy is a fact linked to it by supersession, in either direction, with the same subject, predicate and object. That is exactly the set of facts that carry the same statement, because a revision copies the statement and a correction to another value does not, as ADR 0012 asks.
   - **Confirmed** in the spike: purging `s-1` covered `f-1` and its ended copy `f-1e`, though `f-1e` also carries the end note `s-2`. It did not cover the correction `f-2`, whose object differs.
2. **Which other sources it covers.** Two kinds:
   - every source in P, whose facts the rule above covers;
   - every source that an audit entry about a covered fact, or a feedback row on one, names, called the *explaining sources*. An end note, a correction note and a feedback comment each often quote the value.

   The content of all of them is purged. **Confirmed**: the spike purged `s-1` and `s-1b`, and the explaining sources `s-2`, `s-3` and the feedback comment `s-5`, which quotes the marker.
3. **Whether the purge spreads from an explaining source to its facts.** No. A fact that came only from an explaining source is left as it is, an **orphaned fact**, which `listOrphanedFacts` (phase 3) lists. Such a fact is usually the true replacement of the purged one, and purging it would remove a fact the reporter did not ask to remove. A person who wants it gone purges its source as the target. **Confirmed** in the spike: `f-2`, the correction from `s-3`, stays live with its text.
4. **The marker.**
   - `fact.statement`, `fact.object_value` when the object is a value, and `source.content` when content was kept become the text `[purged]`. `object_value` cannot be `NULL`, because of the `CHECK` on the object columns.
   - `source.locator` and `source.content_hash` become `NULL`: a locator can be the sensitive part, and a hash lets a guess be confirmed.
   - `purged_at` is set on each purged row.

   **Confirmed** in the spike.
5. **A live purged fact.** It is invalidated, with no successor, in the same commit, so a read with a current known-at date no longer returns it. A read with a past known-at date, `getFact`, and `listFacts` with `all` return the row, with the marker and `purgedAt` set, so its existence and history stay visible. Its keyword and vector entries are removed, so neither lane returns it. `recall` drops a purged fact found by the graph lane. **Confirmed** for the rows and the lanes in the spike; the read methods and `recall` are FL-061's contract cases.
6. **The trigger conditions.**
   - **Fact.** `fact_changes_only_by_invalidation` is replaced, because it does not name `purged_at` and would let an invalidation set it. Its replacement, `fact_changes_only_by_invalidation_or_purge`, permits two updates, and every other column is unchanged in both:
     - an invalidation, once, with the text and `purged_at` unchanged;
     - a purge, once: `purged_at` from `NULL` to a time, `statement` to `[purged]`, `object_value` to `[purged]` if it was set and `NULL` if not, and `invalidated_at` and `superseded_by_fact_id` unchanged.
   - **Source.** `source_never_updated` is replaced by `source_changes_only_by_purge`, which permits one update: `purged_at` from `NULL` to a time, `content` to `[purged]` if it was set and `NULL` if not, `content_hash` and `locator` to `NULL`, and every other column unchanged.
   - **Vector.** `fact_embedding_removed_only_by_purge` lets a vector be deleted only when its fact is purged.
   - **Confirmed**: the spike's eight attempts outside these conditions were refused. They included editing a statement, purging with another text, purging an already purged fact, clearing a locator alone, purging a source while changing its kind, clearing its content to `NULL`, and deleting the vector of a fact that is not purged.
7. **An entity name that is itself the sensitive value.** Not covered by `purgeContent`, which works from a source. An entity has no source link, and other facts may name it. A name that is a credential is refused at write time by the secret check of FL-022, which checks entity names. A personal name that must be erased needs a separate entity operation, not designed here. It is listed under "What purge does not remove" and in [open questions](../../research/OPEN-QUESTIONS.md), Q-84. **Unverified** whether any adapter will need it.
8. **Freed pages.** The purge transaction is followed, on the same connection, by `VACUUM` and then `PRAGMA wal_checkpoint(TRUNCATE)`.
   - **Confirmed** in the spike: without them, the old page images were in the write-ahead log while the connection was open, and in the database file after it closed (runs A and B). With them, the bytes of both held no trace (run D).
   - `PRAGMA secure_delete` is not needed and not used: it does not reach the text that earlier invalidations left in freed space, and with `VACUUM` it adds nothing (runs B and E).
   - The SQLite documentation says "Running VACUUM will clean the database of all traces of deleted content, thus preventing an adversary from recovering deleted content" (https://www.sqlite.org/lang_vacuum.html, read 2026-11-17, **confirmed**). That `wal_checkpoint(TRUNCATE)` truncates the log to zero bytes is from https://www.sqlite.org/pragma.html#pragma_wal_checkpoint as summarised by a fetch tool, **likely**, and confirmed by the spike's 0-byte log after it.
   - The checkpoint cannot finish while another connection holds a read transaction (https://www.sqlite.org/wal.html, read 2026-11-17). FL-072's command therefore reports whether it finished.
9. **The old text for the keyword index.** The entry is removed by a trigger, `fact_fts_purge`, that runs when `purged_at` is set. It issues the FTS5 `delete` command with `OLD.rowid` and `OLD.statement`, the text the external-content index needs. The FTS5 option `secure-delete` is turned on once, in the migration; it is stored in the index's config table, so it holds for every connection.
   - **Confirmed**: without the option, the term stayed in the shadow table `fact_fts_data` even after `VACUUM`, though `MATCH` no longer found it (runs A and C).
   - The option's description and its minimum version, SQLite 3.42.0, are from https://www.sqlite.org/fts5.html as summarised by a fetch tool, **likely**. The project's SQLite is 3.54.1.
10. **How a person invokes it.** Through a command of `apps/mcp-server`, built in FL-072, never an MCP tool.
    - `find <text>` lists the sources of the namespace whose content or locator contains the text, by identifier, kind and observed time, with no excerpt.
    - `source <id> --reason erasure_requested|secret_stored` shows what would be purged, the counts of sources and facts, and purges only with `--yes`.
    - It runs `purgeContent` with the trigger `person`, then `VACUUM` and the checkpoint, and says whether the checkpoint finished.
    - **Likely**: the command is FL-072's to build and test.

## What purge does not remove

- **Backups and copies** of the database file made outside Factloom, and earlier versions kept by the file system or the storage device.
- **The write-ahead log, while another connection reads.** If another process holds a read transaction when the purge runs, the checkpoint does not finish and old pages can stay in the log until it does. The command reports this; running it again when the server is stopped finishes it.
- **Entity names** (question 7).
- **What was sent to the LLM provider** by `remember` before the purge, which is outside this database.
- **Audit entries and identifiers.** They stay, by design, and hold no text.

## Considered options

- **No exception.** Rejected: it would make Factloom unusable for personal data and unable to remove a leaked credential.
- **Ordinary deletion.** Rejected: it would break supersession links and make the audit log refer to rows that no longer exist.
