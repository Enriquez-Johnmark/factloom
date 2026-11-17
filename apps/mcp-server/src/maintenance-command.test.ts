// The maintenance command of FL-048, run as a child process of the real entry point.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MaintenanceReportSchema } from '@factloom/maintenance';
import { afterEach, describe, expect, it } from 'vitest';
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
  it('runs with no jobs on a new database, prints a report and exits with 0', async () => {
    const directory = createTemporaryDirectory();
    const started = startServerProcess(
      MAIN,
      { FACTLOOM_DB: join(directory, 'factloom.db'), FACTLOOM_NAMESPACE: 'repo:shop-api' },
      directory,
      ['maintenance'],
    );
    started.close();

    const finished = await started.finished;

    expect(finished.code).toBe(0);
    const report = MaintenanceReportSchema.parse(JSON.parse(finished.standardOutput));
    expect(report.jobs).toEqual([]);
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
