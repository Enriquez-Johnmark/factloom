// Tests with a second process on the same database file. The second process is
// second-process.child.ts, run by Node.js from source. It prints one line when it has reached
// the state its mode promises, and each test waits for that line before it acts.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { at, changeSet, DATABASE, fact, recordFact, writeTimeline } from './memory-store-contract.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { closeLater, closeTestStores, countRows, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

const CHILD_SCRIPT = join(import.meta.dirname, 'second-process.child.ts');
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  closeTestStores();
});

type Child = {
  /** Resolves when the child has printed the given line. Rejects if it exits first. */
  readonly said: (line: string) => Promise<void>;
  /** Resolves with the exit code, or null when the child was killed. */
  readonly exited: Promise<number | null>;
  readonly kill: () => void;
};

function startChild(mode: string, path: string): Child {
  const child = spawn(process.execPath, [CHILD_SCRIPT, mode, path], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const said = (line: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const check = (): void => {
        if (output.split('\n').includes(line)) resolve();
      };
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        check();
      });
      void exited.then((code) =>
        reject(new Error(`The child exited with ${code} before it said "${line}". ${errors}`)),
      );
      check();
    });
  return { said, exited, kill: () => child.kill('SIGKILL') };
}

// Four processes on a new file failed about one time in six before FL-086, so these rounds
// fail almost surely with the runner as it was.
const ROUNDS_OF_FIRST_OPENS = 6;
const PROCESSES_PER_ROUND = 5;

/** Each round starts processes that each load Node.js and the adapter, slower on a busy runner. */
const FIRST_OPEN_TEST_TIMEOUT = 60_000;

/** An open-ended database version, which overlaps the fixture's `pg16` and the child's fact. */
const OPEN_ENDED = recordFact(
  fact('from-parent', DATABASE, 'PostgreSQL 18', {
    validFrom: at('2026-06-01'),
    createdAt: at('2026-06-01'),
  }),
);

describe('two processes on one database file', () => {
  it('a second process reads what the first wrote', async () => {
    const { rows, path } = openOnFile();

    const child = startChild('commit-and-exit', path);
    await child.said('committed');
    expect(await child.exited).toBe(0);

    // A store opened after the child has exited: its schema is up to date and the rows are there.
    const opened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
    if (!opened.ok) throw new Error(opened.error.message);
    closeLater(() => void opened.value.close());
    expect(countRows(rows)).toEqual({
      entity: 1,
      source: 1,
      fact: 1,
      fact_source: 1,
      fact_embedding: 1,
      audit_log: 3,
    });
  });

  it('a commit waits for a writer in another process and then returns conflict', async () => {
    const { store, rows, path } = openOnFile();
    await writeTimeline(store);
    // The fixture's pg16 is invalidated first, so that the only fact the commit below can
    // overlap is the one the child writes while it holds the lock.
    const cleared = await store.commit(
      changeSet(
        'op-4',
        '2026-05-15',
        [{ kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: null }],
        {
          operation: 'retraction',
          reasonCode: 'reported_wrong',
        },
      ),
    );
    expect(cleared.ok).toBe(true);

    // The child prints "locked" after BEGIN IMMEDIATE and its insert, holds the lock for
    // 400 ms, then commits. The commit below starts while the lock is held.
    const child = startChild('hold-the-lock-then-commit', path);
    await child.said('locked');
    const result = await store.commit(changeSet('op-5', '2026-06-01', [OPEN_ENDED]));

    expect(!result.ok && result.error.code).toBe('conflict');
    expect(!result.ok && result.error.relatedFactIds).toEqual(['from-child']);
    expect(await child.exited).toBe(0);
    expect(
      rows
        .prepare(
          "SELECT id FROM fact WHERE subject_entity_id = 'e-repo' AND predicate = ? AND invalidated_at IS NULL AND valid_to IS NULL",
        )
        .all(DATABASE),
    ).toEqual([{ id: 'from-child' }]);
  });

  it('leaves no trace of a commit whose process was killed before it finished', async () => {
    const { store, rows, path } = openOnFile();
    await writeTimeline(store);
    const before = countRows(rows);

    // The child prints "writing" after BEGIN IMMEDIATE and its inserts, and never commits.
    const child = startChild('begin-and-hang', path);
    await child.said('writing');
    child.kill();
    await child.exited;

    const reopened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
    if (!reopened.ok) throw new Error(reopened.error.message);
    closeLater(() => void reopened.value.close());
    expect(countRows(rows)).toEqual(before);
    const next = await reopened.value.commit(
      changeSet('op-4', '2026-06-02', [
        recordFact(fact('redis', 'depends_on', 'Redis', { createdAt: at('2026-06-02') }), {
          singleValued: false,
        }),
      ]),
    );
    expect(next.ok).toBe(true);
  });

  it('keeps every change of a commit whose process was killed just after it returned', async () => {
    const { rows, path } = openOnFile();

    // The child prints "committed" when its commit has returned, and then hangs.
    const child = startChild('commit-and-hang', path);
    await child.said('committed');
    child.kill();
    await child.exited;

    expect(countRows(rows)).toEqual({
      entity: 1,
      source: 1,
      fact: 1,
      fact_source: 1,
      fact_embedding: 1,
      audit_log: 3,
    });
  });

  it(
    'several processes opening one new file at once all succeed',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'factloom-first-open-'));
      closeLater(() => rmSync(directory, { recursive: true }));
      const migrationFiles = readdirSync(join(import.meta.dirname, '..', 'migrations')).filter((name) =>
        name.endsWith('.sql'),
      );

      for (let round = 1; round <= ROUNDS_OF_FIRST_OPENS; round += 1) {
        const path = join(directory, `round-${round}.db`);
        const openers = Array.from({ length: PROCESSES_PER_ROUND }, () => startChild('open-and-exit', path));
        expect(await Promise.all(openers.map((child) => child.exited))).toEqual(openers.map(() => 0));

        const rows = new Database(path, { readonly: true });
        const recorded = rows.prepare('SELECT count(*) AS count FROM schema_migration').get();
        rows.close();
        expect(recorded).toEqual({ count: migrationFiles.length });
      }
    },
    FIRST_OPEN_TEST_TIMEOUT,
  );
});
