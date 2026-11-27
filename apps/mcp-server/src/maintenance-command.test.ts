// The maintenance command of FL-048, run as a child process of the real entry point, with the
// verification job of FL-050 on a fixture repository.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MaintenanceReportSchema } from '@kronomind/maintenance';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureRepository } from './testing/fixture-repository.ts';
import { startServerProcess } from './testing/server-process.ts';

const MAIN = join(import.meta.dirname, 'main.ts');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-maintenance-'));
  directories.push(directory);
  return directory;
}

describe('the maintenance command', () => {
  it('runs the verification and repair jobs on a new database, prints a report and exits with 0', async () => {
    const directory = createTemporaryDirectory();
    const repository = createFixtureRepository();
    repository.commit({ 'README.md': 'shop-api\n' }, 'Start');
    const started = startServerProcess(
      MAIN,
      {
        FACTLOOM_DB: join(directory, 'factloom.db'),
        FACTLOOM_NAMESPACE: 'repo:shop-api',
        FACTLOOM_REPO: repository.directory,
      },
      directory,
      ['maintenance'],
    );
    started.close();

    const finished = await started.finished;
    repository.remove();

    expect(finished.code).toBe(0);
    const report = MaintenanceReportSchema.parse(JSON.parse(finished.standardOutput));
    expect(report.jobs).toEqual([
      {
        name: 'verify_anchored_facts',
        status: 'ok',
        error: null,
        examined: 0,
        changed: 0,
        flagged: 0,
        failed: 0,
        undecided: 0,
        flaggedItems: [],
      },
      {
        name: 'repair_moved_anchors',
        status: 'ok',
        error: null,
        examined: 0,
        changed: 0,
        flagged: 0,
        failed: 0,
        undecided: 0,
        flaggedItems: [],
      },
      {
        name: 'record_codebase_map',
        status: 'ok',
        error: null,
        examined: 0,
        changed: 0,
        flagged: 0,
        failed: 0,
        undecided: 0,
        flaggedItems: [],
      },
      {
        name: 'find_duplicate_entities',
        status: 'ok',
        error: null,
        examined: 0,
        changed: 0,
        flagged: 0,
        failed: 0,
        undecided: 0,
        flaggedItems: [],
      },
      {
        name: 'archive_unused_facts',
        status: 'ok',
        error: null,
        examined: 0,
        changed: 0,
        flagged: 0,
        failed: 0,
        undecided: 0,
        flaggedItems: [],
      },
    ]);
  }, 30_000);

  it('reports the jobs that read the repository as failed and exits with 1 when FACTLOOM_REPO is not a git repository', async () => {
    const directory = createTemporaryDirectory();
    const started = startServerProcess(
      MAIN,
      {
        FACTLOOM_DB: join(directory, 'factloom.db'),
        FACTLOOM_NAMESPACE: 'repo:shop-api',
        FACTLOOM_REPO: directory,
      },
      directory,
      ['maintenance'],
    );
    started.close();

    const finished = await started.finished;

    expect(finished.code).toBe(1);
    const report = MaintenanceReportSchema.parse(JSON.parse(finished.standardOutput));
    expect(report.jobs).toMatchObject([
      { name: 'verify_anchored_facts', status: 'failed', error: 'invalid_input' },
      { name: 'repair_moved_anchors', status: 'failed', error: 'invalid_input' },
      { name: 'record_codebase_map', status: 'failed', error: 'invalid_input' },
      { name: 'find_duplicate_entities', status: 'ok' },
      { name: 'archive_unused_facts', status: 'ok' },
    ]);
  }, 30_000);

  it('refuses to start with no namespace, and says why on standard error', async () => {
    const directory = createTemporaryDirectory();
    const started = startServerProcess(MAIN, { FACTLOOM_DB: join(directory, 'factloom.db') }, directory, [
      'maintenance',
    ]);
    started.close();

    const finished = await started.finished;

    expect(finished.code).not.toBe(0);
    expect(finished.standardOutput).toBe('');
    expect(finished.standardError).toContain('FACTLOOM_NAMESPACE is not set');
  }, 30_000);
});
