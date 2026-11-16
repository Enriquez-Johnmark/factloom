import { err } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { toToolError } from './to-tool-error.ts';

describe('toToolError', () => {
  it('puts the related fact identifiers after the message of an error', () => {
    const { error } = err('conflict', 'The fact overlaps another value.', { relatedFactIds: ['f-1', 'f-2'] });

    expect(toToolError(error)).toEqual({
      isError: true,
      content: [
        { type: 'text', text: 'conflict: The fact overlaps another value. Related facts: f-1, f-2.' },
      ],
    });
  });

  it('gives only the code and the message when no fact is related', () => {
    const { error } = err('storage_failed', 'The disk is full.');

    expect(toToolError(error).content).toEqual([{ type: 'text', text: 'storage_failed: The disk is full.' }]);
  });
});
