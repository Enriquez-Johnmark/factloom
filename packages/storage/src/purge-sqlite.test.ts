// SQLite tests of purge (FL-061): what the contract suite cannot see. Every column of every
// table, the bytes of the file and its write-ahead log, the triggers, and the inventory that
// keeps purge complete when a later migration adds a column.
import { readFileSync } from 'node:fs';
import { type Change, type MemoryStore, purgeContent } from '@kronomind/core';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { clearFreedPages } from './clear-freed-pages.ts';
import { at, changeSet, fact, recordFact, source, writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { closeLater, closeTestStores, openOnFile } from './sqlite-test-store.ts';

const NAMESPACE = 'repo:example';
const MARKER = 'ZEBRA7731';
const STATEMENT = `The deploy key is ${MARKER}`;

/**
 * Every text and binary column of the migrated schema, classified. "content" is text a
 * purge removes or a derivative of it; "not content" holds no text from a source. A column
 * added by a later migration must be put in one list, so that purge stays complete.
 */
const CONTENT_COLUMNS = [
  'fact.statement',
  'fact.object_value',
  'source.content',
  'source.content_hash',
  'source.locator',
  'fact_embedding.embedding',
  'fact_fts.statement',
  'fact_fts_data.block',
  'fact_fts_idx.term',
  // A proposal's new fact holds a statement and a value from the source (FL-043).
  'proposed_change.new_fact',
];
const NOT_CONTENT_COLUMNS = [
  'audit_log.namespace',
  'audit_log.operation_id',
  'audit_log.operation',
  'audit_log.action',
  'audit_log.target_kind',
  'audit_log.target_id',
  'audit_log.trigger',
  'audit_log.reason_code',
  'audit_log.source_id',
  'audit_log.detail',
  'audit_log.occurred_at',
  'entity.id',
  'entity.namespace',
  'entity.type',
  // Entity names are not covered by purge (ADR 0012, "The phase 2 design", question 7; Q-84).
  'entity.name',
  'entity.name_key',
  'entity.created_at',
  'entity_merge.id',
  'entity_merge.namespace',
  'entity_merge.from_entity_id',
  'entity_merge.into_entity_id',
  'entity_merge.merged_at',
  'entity_merge.undone_at',
  'proposed_change.id',
  'proposed_change.namespace',
  'proposed_change.stored_fact_id',
  'proposed_change.kind',
  'proposed_change.changed_at',
  'proposed_change.source_id',
  'proposed_change.reason_code',
  'proposed_change.proposed_at',
  'proposed_change.state',
  'proposed_change.decided_at',
  'fact_archive.id',
  'fact_archive.namespace',
  'fact_archive.fact_id',
  'fact_archive.archived_at',
  'fact_archive.unarchived_at',
  'fact_verification.id',
  'fact_verification.namespace',
  'fact_verification.fact_id',
  'fact_verification.outcome',
  'fact_verification.method',
  'fact_verification.verified_at',
  'fact_usage.fact_id',
  'fact_usage.namespace',
  'fact_usage.last_recalled_at',
  'fact_usage_tracking.namespace',
  'fact_usage_tracking.started_at',
  'fact.id',
  'fact.namespace',
  'fact.subject_entity_id',
  'fact.predicate',
  'fact.object_entity_id',
  'fact.valid_from',
  'fact.valid_to',
  'fact.created_at',
  'fact.invalidated_at',
  'fact.superseded_by_fact_id',
  'fact.purged_at',
  'fact_confidence.fact_id',
  'fact_confidence.adjusted_at',
  'fact_embedding.fact_id',
  'fact_embedding.model',
  'fact_fts_config.k',
  'fact_fts_config.v',
  'fact_fts_docsize.sz',
  'fact_fts_idx.segid',
  'fact_fts_idx.pgno',
  'fact_source.fact_id',
  'fact_source.source_id',
  'feedback.id',
  'feedback.namespace',
  'feedback.fact_id',
  'feedback.signal',
  'feedback.trigger',
  'feedback.source_id',
  'feedback.recorded_at',
  'source.id',
  'source.namespace',
  'source.kind',
  'source.version',
  'source.observed_at',
  'source.created_at',
  'source.purged_at',
  'schema_migration.name',
  'schema_migration.sha256',
  'schema_migration.applied_at',
  'sqlite_sequence.name',
  'sqlite_sequence.seq',
];

function listTables(db: Database.Database): string[] {
  return db
    .prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

/** Every column of every table whose type can hold text or bytes: TEXT, BLOB, or no type. */
function listTextColumns(db: Database.Database): string[] {
  const columns: string[] = [];
  for (const table of listTables(db)) {
    // The table name comes from sqlite_schema, never from outside.
    const info = db
      .prepare<[], { name: string; type: string }>(`SELECT name, type FROM pragma_table_info('${table}')`)
      .all();
    for (const { name, type } of info) {
      if (!['INTEGER', 'REAL'].includes(type.toUpperCase())) columns.push(`${table}.${name}`);
    }
  }
  return columns;
}

/** The text and binary columns that neither list classifies. */
function findUnclassifiedColumns(db: Database.Database): string[] {
  const classified = new Set([...CONTENT_COLUMNS, ...NOT_CONTENT_COLUMNS]);
  return listTextColumns(db).filter((column) => !classified.has(column));
}

/** The columns of any table that hold the marker, compared case-insensitively as bytes. */
function findMarker(db: Database.Database): string[] {
  const found: string[] = [];
  for (const column of listTextColumns(db)) {
    const [table, name] = column.split('.');
    const hits = db
      .prepare<[string], { n: number }>(
        `SELECT count(*) AS n FROM "${table}" WHERE instr(lower(CAST("${name}" AS BLOB)), lower(CAST(? AS BLOB))) > 0`,
      )
      .get(MARKER);
    if ((hits?.n ?? 0) > 0) found.push(column);
  }
  return found;
}

/**
 * k-1 from s-key; ended as k-1e with the note s-rotated; corrected by k-2 from s-fix, which
 * quotes the marker; and a pending proposal from s-prop, with s-key's text, whose new fact quotes it.
 */
async function buildSecret(store: MemoryStore): Promise<void> {
  await writeTimeline(store);
  const keyFact = (id: string, value: string, day: string, validTo: string | null) =>
    fact(id, 'has_deploy_key', value, {
      statement: `The deploy key is ${value}`,
      createdAt: at(day),
      validTo: validTo === null ? null : at(validTo),
    });
  const keySource = (id: string, day: string, content: string): Change => ({
    kind: 'record_source',
    source: { ...source(id, day, content), contentHash: `h-${id}`, locator: `notes/${MARKER}-${id}.md` },
  });
  const commits = [
    changeSet('op-key-1', '2026-05-01', [
      keySource('s-key', '2026-05-01', `The deploy key is ${MARKER}.`),
      recordFact(keyFact('k-1', MARKER, '2026-05-01', null), {
        sourceIds: ['s-key'],
        embedding: new Float32Array([0, 0, 0, 1]),
      }),
    ]),
    changeSet(
      'op-key-2',
      '2026-05-10',
      [
        keySource('s-rotated', '2026-05-10', 'The key was rotated on 1 May.'),
        recordFact(keyFact('k-1e', MARKER, '2026-05-10', '2026-05-01'), {
          sourceIds: ['s-key', 's-rotated'],
          embedding: { copyFromFactId: 'k-1' },
        }),
        { kind: 'invalidate_fact', factId: 'k-1', supersededByFactId: 'k-1e' },
      ],
      { operation: 'revision', reasonCode: 'reported_ended', explainedBySourceId: 's-rotated' },
    ),
    changeSet(
      'op-key-3',
      '2026-05-20',
      [
        keySource('s-fix', '2026-05-20', `Correction: it was never ${MARKER}; it is KEY-B.`),
        recordFact(keyFact('k-2', 'KEY-B', '2026-05-20', '2026-05-01'), {
          sourceIds: ['s-fix'],
          embedding: new Float32Array([0, 0, 1, 1]),
        }),
        { kind: 'invalidate_fact', factId: 'k-1e', supersededByFactId: 'k-2' },
      ],
      { operation: 'correction', reasonCode: 'reported_wrong', explainedBySourceId: 's-fix' },
    ),
    // The same text remembered again under human_approval: a proposal whose source has the
    // same content hash as s-key, and whose new fact quotes the marker (FL-070, Q-85).
    changeSet(
      'op-key-4',
      '2026-05-25',
      [
        {
          kind: 'record_source',
          source: {
            ...source('s-prop', '2026-05-25', `The deploy key is ${MARKER}.`),
            contentHash: 'h-s-key',
          },
        },
        {
          kind: 'record_proposal',
          proposal: {
            id: 'p-key',
            namespace: NAMESPACE,
            storedFactId: 'k-2',
            supersession: { kind: 'correction' },
            newFact: {
              fact: {
                subjectEntityId: 'e-repo',
                predicate: 'has_deploy_key',
                object: { kind: 'value', value: MARKER },
                statement: `The deploy key is ${MARKER}`,
                confidence: 1,
                validFrom: null,
                validTo: null,
              },
              newEntities: [],
            },
            sourceId: 's-prop',
            reasonCode: 'judged_wrong',
            proposedAt: at('2026-05-25'),
            state: 'pending',
            decidedAt: null,
          },
        },
      ],
      { operation: 'proposal', reasonCode: 'judged_wrong', explainedBySourceId: 's-prop' },
    ),
  ];
  for (const commit of commits) {
    const result = await store.commit(commit);
    if (!result.ok) throw new Error(result.error.message);
  }
}

async function purgeKey(store: MemoryStore) {
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `purge-${count}`;
  };
  const purged = await purgeContent(
    { store, now: () => at('2026-06-01'), newId },
    { namespace: NAMESPACE, trigger: 'person', reasonCode: 'secret_stored', sourceId: 's-key' },
  );
  if (!purged.ok) throw new Error(purged.error.message);
}

function bytesContain(path: string, text: string): boolean {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return false;
  }
  return Buffer.from(bytes.toString('latin1').toLowerCase(), 'latin1').includes(
    Buffer.from(text.toLowerCase(), 'latin1'),
  );
}

afterEach(closeTestStores);

describe('purge in SQLite', () => {
  it('leaves the marker in no column of any table, the keyword index and the embeddings included', async () => {
    const { store, rows } = openOnFile();
    await buildSecret(store);
    expect(findMarker(rows).length).toBeGreaterThan(0);

    await purgeKey(store);

    expect(findMarker(rows)).toEqual([]);
  });

  it('leaves neither the marker nor the purged statement in the bytes of the file or the log, after clearFreedPages', async () => {
    const { store, path } = openOnFile();
    await buildSecret(store);
    await purgeKey(store);
    await store.close();

    const cleared = clearFreedPages(path);

    expect(cleared).toEqual({ ok: true, value: { checkpointComplete: true } });
    for (const file of [path, `${path}-wal`]) {
      expect(bytesContain(file, MARKER), file).toBe(false);
      expect(bytesContain(file, STATEMENT), file).toBe(false);
    }
  });

  it('refuses an update of statement, object_value, content or locator outside the purge condition', async () => {
    const { store, path } = openOnFile();
    await buildSecret(store);
    await purgeKey(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    const at2 = "'2026-06-02T00:00:00.000Z'";
    const refused = [
      "UPDATE fact SET statement = 'edited' WHERE id = 'pg16'",
      `UPDATE fact SET object_value = 'edited', purged_at = ${at2} WHERE id = 'pg16'`,
      `UPDATE fact SET statement = '[purged]', purged_at = ${at2} WHERE id = 'k-1'`,
      "UPDATE source SET content = 'edited' WHERE id = 's-1'",
      "UPDATE source SET locator = NULL WHERE id = 's-1'",
      `UPDATE source SET content = NULL, content_hash = NULL, locator = NULL, purged_at = ${at2} WHERE id = 's-1'`,
      "DELETE FROM fact_embedding WHERE fact_id = 'pg16'",
    ];

    for (const sql of refused) expect(() => db.exec(sql), sql).toThrow(/changes only|removed only/);
  });

  it('classifies every text and binary column of the schema as content or not content', () => {
    const { rows } = openOnFile();

    expect(findUnclassifiedColumns(rows)).toEqual([]);
  });

  it('finds a text column that a later migration adds without classifying it', () => {
    const { path } = openOnFile();
    const db = openConnection(path);
    closeLater(() => db.close());

    db.exec('ALTER TABLE source ADD COLUMN summary TEXT');

    expect(findUnclassifiedColumns(db)).toEqual(['source.summary']);
  });
});
