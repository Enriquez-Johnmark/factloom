// A second process for the adapter tests, started with `node second-process.child.ts <mode>
// <path>`. It prints one line when it has reached the state its mode promises, so that the
// test knows when to act. It is not a test file and holds no assertions.
import type { ChangeSet, Timestamp } from '@factloom/core';
import { parseDateInput } from '@factloom/core';
import Database from 'better-sqlite3';
import { openSqliteMemoryStore } from './index.ts';

const [mode, path] = process.argv.slice(2);
if (mode === undefined || path === undefined) throw new Error('Usage: <mode> <path>');

const NAMESPACE = 'repo:example';

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** Blocks this process without letting anything else in it run. */
function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** One entity, one source and one fact, as one change set. */
const SMALL_FIXTURE: ChangeSet = {
  namespace: NAMESPACE,
  operationId: 'child-op-1',
  operation: 'remember',
  trigger: 'agent',
  reasonCode: 'stated',
  explainedBySourceId: 'child-s-1',
  occurredAt: at('2026-01-10'),
  changes: [
    {
      kind: 'create_entity',
      entity: {
        id: 'child-e-repo',
        namespace: NAMESPACE,
        type: 'repository',
        name: 'child',
        createdAt: at('2026-01-10'),
      },
    },
    {
      kind: 'record_source',
      source: {
        id: 'child-s-1',
        namespace: NAMESPACE,
        kind: 'agent_note',
        locator: null,
        version: null,
        content: 'Written by a second process.',
        contentHash: null,
        purgedAt: null,
        observedAt: at('2026-01-10'),
        createdAt: at('2026-01-10'),
      },
    },
    {
      kind: 'record_fact',
      fact: {
        id: 'child-fact',
        namespace: NAMESPACE,
        subjectEntityId: 'child-e-repo',
        predicate: 'uses_database_version',
        object: { kind: 'value', value: 'PostgreSQL 15' },
        statement: 'The child repository uses PostgreSQL 15',
        confidence: 1,
        validFrom: null,
        validTo: null,
        createdAt: at('2026-01-10'),
        invalidatedAt: null,
        purgedAt: null,
        supersededByFactId: null,
      },
      sourceIds: ['child-s-1'],
      embedding: new Float32Array([1, 0, 0, 0]),
      singleValued: true,
    },
  ],
};

async function commitThroughTheAdapter(): Promise<void> {
  const opened = openSqliteMemoryStore({
    path: path ?? '',
    embeddingModel: 'fixture-model',
    embeddingDimensions: 4,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  const committed = await opened.value.commit(SMALL_FIXTURE);
  if (!committed.ok) throw new Error(committed.error.message);
}

/**
 * Takes the write lock and writes an open-ended fact for the subject and single-valued
 * predicate the test also writes to. It uses the driver directly: the adapter's commit is one
 * synchronous call, so nothing can hold its lock open between two steps.
 */
function beginAndRecord(): Database.Database {
  const db = new Database(path ?? '', { timeout: 5000 });
  db.pragma('foreign_keys = ON');
  db.exec('BEGIN IMMEDIATE');
  db.prepare(
    `INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, statement, confidence, created_at)
     VALUES ('from-child', ?, 'e-repo', 'uses_database_version', 'PostgreSQL 17', 'The example repository uses PostgreSQL 17', 1, ?)`,
  ).run(NAMESPACE, at('2026-06-01'));
  db.prepare("INSERT INTO fact_source (fact_id, source_id) VALUES ('from-child', 's-1')").run();
  return db;
}

switch (mode) {
  case 'commit-and-exit':
    await commitThroughTheAdapter();
    say('committed');
    break;
  case 'commit-and-hang':
    await commitThroughTheAdapter();
    say('committed');
    sleep(60_000);
    break;
  case 'hold-the-lock-then-commit': {
    const db = beginAndRecord();
    say('locked');
    sleep(400);
    db.exec('COMMIT');
    db.close();
    break;
  }
  case 'begin-and-hang':
    beginAndRecord();
    say('writing');
    sleep(60_000);
    break;
  default:
    throw new Error(`Unknown mode: ${mode}`);
}
