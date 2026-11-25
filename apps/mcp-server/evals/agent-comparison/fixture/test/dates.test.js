import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, parseIsoDate } from '../lib/dates.js';

test('parses a calendar date to midnight UTC', () => {
  assert.equal(parseIsoDate('2026-03-31').toISOString(), '2026-03-31T00:00:00.000Z');
});

test('refuses text that is not a calendar date', () => {
  assert.throws(() => parseIsoDate('31/03/2026'));
});

test('adds days across the end of a month', () => {
  assert.equal(addDays(parseIsoDate('2026-03-31'), 1).toISOString(), '2026-04-01T00:00:00.000Z');
});
