import { err, ok, toTimestamp } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { type MaintenanceJob, MaintenanceReportSchema, runMaintenance } from './run-maintenance.ts';

/** A clock that moves one minute on each reading, from 2026-06-01. */
function steppingClock() {
  let minute = 0;
  return () => {
    const moment = toTimestamp(new Date(Date.UTC(2026, 5, 1, 0, minute)));
    minute += 1;
    return moment;
  };
}

describe('runMaintenance', () => {
  it('runs every job in order, and a job that fails does not stop the ones after it', async () => {
    const ran: string[] = [];
    const job = (name: string, outcome: 'ok' | 'fails'): MaintenanceJob => ({
      name,
      run: async () => {
        ran.push(name);
        return outcome === 'ok'
          ? ok({
              examined: 3,
              changed: 1,
              flagged: 1,
              failed: 0,
              flaggedItems: [{ id: 'f-1', reason: 'source_missing' }],
            })
          : err('storage_failed', 'Disk full.');
      },
    });

    const report = await runMaintenance({ now: steppingClock() }, [
      job('first', 'ok'),
      job('second', 'fails'),
      job('third', 'ok'),
    ]);

    expect(ran).toEqual(['first', 'second', 'third']);
    expect(report.jobs.map(({ name, status, error }) => [name, status, error])).toEqual([
      ['first', 'ok', null],
      ['second', 'failed', 'storage_failed'],
      ['third', 'ok', null],
    ]);
    expect(report.jobs[0]).toMatchObject({ examined: 3, changed: 1, flagged: 1, failed: 0 });
  });

  it('reports a job that throws as failed and runs the next', async () => {
    const report = await runMaintenance({ now: steppingClock() }, [
      { name: 'throws', run: () => Promise.reject(new Error('boom')) },
      {
        name: 'after',
        run: () => Promise.resolve(ok({ examined: 0, changed: 0, flagged: 0, failed: 0, flaggedItems: [] })),
      },
    ]);

    expect(report.jobs.map(({ name, status }) => [name, status])).toEqual([
      ['throws', 'failed'],
      ['after', 'ok'],
    ]);
  });

  it('reports an empty list with the times of the run when no job is registered', async () => {
    const report = await runMaintenance({ now: steppingClock() }, []);

    expect(report).toEqual({
      startedAt: '2026-06-01T00:00:00.000Z',
      finishedAt: '2026-06-01T00:01:00.000Z',
      jobs: [],
    });
    expect(MaintenanceReportSchema.safeParse(report).success).toBe(true);
  });
});
