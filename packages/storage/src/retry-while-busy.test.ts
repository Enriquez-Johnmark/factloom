import { describe, expect, it } from 'vitest';
import { retryWhileBusy } from './retry-while-busy.ts';

/** An error as better-sqlite3 throws it, with SQLite's result code. */
function sqliteError(code: string): Error {
  return Object.assign(new Error('database is locked'), { code });
}

/** A step that fails with the given errors in turn, then returns 'wal'. */
function failingThen(errors: readonly Error[]): { readonly run: () => string; readonly calls: () => number } {
  let calls = 0;
  return {
    run: () => {
      const error = errors[calls];
      calls += 1;
      if (error !== undefined) throw error;
      return 'wal';
    },
    calls: () => calls,
  };
}

describe('retrying a step while the database is busy', () => {
  it('returns what the step returns once it stops reporting busy', () => {
    const step = failingThen([sqliteError('SQLITE_BUSY'), sqliteError('SQLITE_BUSY_RECOVERY')]);

    const result = retryWhileBusy(step.run, { attempts: 5, pauseMs: 0 });

    expect([result, step.calls()]).toEqual(['wal', 3]);
  });

  it('throws any other error at once', () => {
    const step = failingThen([sqliteError('SQLITE_CORRUPT')]);

    expect(() => retryWhileBusy(step.run, { attempts: 5, pauseMs: 0 })).toThrow('database is locked');
    expect(step.calls()).toBe(1);
  });

  it('throws the busy error when every attempt reports busy', () => {
    const step = failingThen(Array.from({ length: 5 }, () => sqliteError('SQLITE_BUSY')));

    expect(() => retryWhileBusy(step.run, { attempts: 3, pauseMs: 0 })).toThrow('database is locked');
    expect(step.calls()).toBe(3);
  });
});
