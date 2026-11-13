---
paths:
  - "packages/storage/**"
---

# Data rules

The design is in `docs/architecture/SCHEMA.md`. These are the rules to follow when writing storage code.

## Facts are bi-temporal

- Every fact has `valid_from` and `valid_to` (when it was true) and `created_at` and `invalidated_at` (when Factloom believed it). Never drop one from a table or a query.
- Both periods are half-open: the start is included and the end is not.
- A missing `valid_from` or `valid_to` is `NULL`. Never store a sentinel date.
- Every read that returns facts applies the whole time predicate. Do not write a query that returns facts without it, except fact history.

```sql
    f.created_at <= :known_at
AND (f.invalidated_at IS NULL OR f.invalidated_at > :known_at)
AND (f.valid_from IS NULL OR f.valid_from <= :valid_at)
AND (f.valid_to   IS NULL OR f.valid_to   >  :valid_at)
```

## Invalidate, never delete

- Never `DELETE` a fact, an entity, a source or an audit entry.
- The only `UPDATE` to a fact sets `invalidated_at` once, with `superseded_by_fact_id` if there is a replacement. An edit is a new row.
- Do not weaken or drop the triggers that enforce this. Purge is the one exception and has its own operation.

```sql
UPDATE fact SET invalidated_at = :now, superseded_by_fact_id = :replacement
WHERE id = :id AND namespace = :namespace AND invalidated_at IS NULL;
```

## Sources and the audit log

- Insert at least one `fact_source` row with every fact, in the same transaction.
- Write one `audit_log` row per row inserted or invalidated, in the same transaction, sharing one `operation_id`.
- Put identifiers and reasons in the audit log. Never put fact or source text in it.

## Namespaces

- Every query filters on `namespace`. Every insert sets it. Never join rows from two namespaces.

## Timestamps

- Timestamps are text, `YYYY-MM-DDTHH:MM:SS.sssZ`, produced by `toTimestamp` in `core` and passed in as parameters.
- Never call `datetime('now')`, `CURRENT_TIMESTAMP` or `strftime` in SQL to produce a stored value.

## SQL

- Write SQL by hand. No ORM and no query builder.
- Always bind parameters. Never build SQL by joining strings with values.
- Prepare each statement once and reuse it.
- Keep SQL in `packages/storage`. No other package contains a statement or sees a row.
- A `commit` is one transaction: every change in the change set applies, or none does.

```ts
const insertFact = db.prepare(`INSERT INTO fact (id, namespace, ...) VALUES (@id, @namespace, ...)`);
```

## Migrations

- A schema change is a new numbered file in `packages/storage/migrations/`: `0002_add_feedback.sql`.
- Never edit a migration that has been released. Fix a mistake with a new migration.
- Migrations only move forward. Do not write down migrations.
- Note in the migration, in a comment, what the Postgres version will do differently.

## Vectors

- Store embeddings in `fact_embedding` with their model and dimensions. Search with `vec_distance_cosine()` and the time predicate in the same query.
- Refuse a vector whose model or size differs from the database's.
