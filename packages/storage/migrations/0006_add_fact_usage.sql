-- Factloom schema, sixth migration: usage of facts by recall (FL-055). Never edit this file
-- once it is released: fix a mistake with a new migration.
--
-- Usage is bookkeeping, not memory (INTERFACES.md, "Reads never write"). The recall tool
-- records it after recall has returned, outside commit and with no audit entry. fact_usage
-- holds one row per fact, updated in place: the one table whose rows change, which is
-- acceptable because it holds no content. A lost update is acceptable.
--
-- fact_usage_tracking holds, per namespace, the time of the first usage write, so that a job
-- can tell a fact never used from one used before counting began.
--
-- What the Postgres version of this migration will do differently:
--   * Timestamps: timestamptz in place of fixed-format text with a CHECK.
--   * STRICT tables: ordinary typed columns; recall_count a bigint.
--   * The batched write: INSERT ... ON CONFLICT DO UPDATE, as here.

CREATE TABLE fact_usage (
  fact_id           TEXT PRIMARY KEY REFERENCES fact (id),
  namespace         TEXT NOT NULL,
  last_recalled_at  TEXT NOT NULL CHECK (last_recalled_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  recall_count      INTEGER NOT NULL CHECK (recall_count >= 1)
) STRICT;

CREATE TABLE fact_usage_tracking (
  namespace   TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL CHECK (started_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
) STRICT;
