// Check of the task utc-dates: endOfMonth works in UTC. The runner starts it with
// TZ=America/Los_Angeles, where local-time Date methods give the wrong month.
import assert from 'node:assert/strict';
import test from 'node:test';
import { endOfMonth, parseIsoDate } from '../lib/dates.js';

test('returns the last day of the month at midnight UTC', () => {
  assert.equal(endOfMonth(parseIsoDate('2026-02-10')).toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(endOfMonth(parseIsoDate('2028-02-15')).toISOString(), '2028-02-29T00:00:00.000Z');
});

test('keeps the month of a date at midnight UTC on the first day', () => {
  assert.equal(endOfMonth(parseIsoDate('2026-03-01')).toISOString(), '2026-03-31T00:00:00.000Z');
  assert.equal(endOfMonth(parseIsoDate('2026-12-01')).toISOString(), '2026-12-31T00:00:00.000Z');
});
