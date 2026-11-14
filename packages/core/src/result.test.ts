import { describe, expect, it } from 'vitest';
import { ERROR_CODES, type ErrorCode, err, ok, type Result } from './result.ts';

/** Says what a caller should do about each code. Stops compiling if a code is added and not handled. */
function describeNextStep(code: ErrorCode): string {
  switch (code) {
    case 'invalid_input':
      return 'fix the input';
    case 'not_found':
      return 'check the identifier';
    case 'already_invalidated':
      return 'use the superseding fact';
    case 'already_exists':
      return 'read the existing row';
    case 'conflict':
      return 'resolve the overlapping fact';
    case 'embedding_model_mismatch':
      return 're-embed or change the embedder';
    case 'storage_failed':
      return 'retry later';
    case 'llm_failed':
      return 'retry or record the fact without the LLM';
    case 'embedding_failed':
      return 'retry later';
    default: {
      const unhandled: never = code;
      return unhandled;
    }
  }
}

/** Returns the failure of a call it made, without rebuilding it, as a result of another value type. */
function parseCount(text: string): Result<number> {
  const trimmed: Result<string> = text.trim() === '' ? err('invalid_input', 'The text is empty.') : ok(text);
  if (!trimmed.ok) return trimmed;
  return ok(Number(trimmed.value));
}

describe('ERROR_CODES', () => {
  it('lists the nine error codes in the documented order', () => {
    expect(ERROR_CODES).toEqual([
      'invalid_input',
      'not_found',
      'already_invalidated',
      'already_exists',
      'conflict',
      'embedding_model_mismatch',
      'storage_failed',
      'llm_failed',
      'embedding_failed',
    ]);
  });

  it('has a next step for every code', () => {
    expect(ERROR_CODES.map(describeNextStep).every((step) => step.length > 0)).toBe(true);
  });
});

describe('ok', () => {
  it('builds a success that carries the value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });
});

describe('err', () => {
  it('builds a failure with no related facts unless they are given', () => {
    expect(err('not_found', 'No such fact.')).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'No such fact.', relatedFactIds: [] },
    });
    expect(
      err('conflict', 'A live fact overlaps.', { relatedFactIds: ['fact-1'] }).error.relatedFactIds,
    ).toEqual(['fact-1']);
  });

  it('leaves out the cause when none is given', () => {
    expect('cause' in err('storage_failed', 'The database is locked.').error).toBe(false);
  });

  it('carries the cause when one is given', () => {
    const cause = new Error('SQLITE_BUSY');
    expect(err('storage_failed', 'The database is locked.', { cause }).error.cause).toBe(cause);
  });

  it('lets a function return the failure of a call it made as a result of another type', () => {
    expect(parseCount('  ')).toEqual(err('invalid_input', 'The text is empty.'));
    expect(parseCount('7')).toEqual(ok(7));
  });
});
