import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ATTEMPTS, withRetry } from '../lib/retry.js';

test('returns the result of the first attempt that succeeds', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error('503 Service Unavailable');
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('gives up with the last error after MAX_ATTEMPTS failed attempts', async () => {
  let attempts = 0;
  const failing = async () => {
    attempts += 1;
    throw new Error(`failure ${attempts}`);
  };
  await assert.rejects(withRetry(failing), new RegExp(`failure ${MAX_ATTEMPTS}$`));
  assert.equal(attempts, MAX_ATTEMPTS);
});
