import assert from 'node:assert/strict';
import test from 'node:test';
import { branchById } from '../lib/config/branches.js';
import { addDays, daysBetween, isOpenOn, nextOpenDay, weekdayOf } from '../lib/helpers/dates.js';

test('adds days across the end of a month and a year', () => {
  assert.equal(addDays('2026-11-26', 7), '2026-12-03');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('counts the days between two dates', () => {
  assert.equal(daysBetween('2026-11-20', '2026-11-26'), 6);
  assert.equal(daysBetween('2026-11-26', '2026-11-20'), -6);
});

test('gives the day of the week, Sunday being 0', () => {
  assert.equal(weekdayOf('2026-11-29'), 0);
  assert.equal(weekdayOf('2026-11-26'), 4);
});

test('a branch is closed on its closed weekdays', () => {
  const riverside = branchById('riverside');
  assert.equal(isOpenOn(riverside, '2026-11-29'), false);
  assert.equal(isOpenOn(riverside, '2026-11-30'), false);
  assert.equal(isOpenOn(riverside, '2026-12-01'), true);
});

test('the next open day of a closed day is the first day the branch opens again', () => {
  assert.equal(nextOpenDay(branchById('riverside'), '2026-11-29'), '2026-12-01');
  assert.equal(nextOpenDay(branchById('central'), '2026-11-26'), '2026-11-26');
});
