import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDueDate } from '../lib/circulation/due-dates.js';
import { branchById } from '../lib/config/branches.js';

test('a book is due three weeks after it is lent', () => {
  const dueOn = computeDueDate({ checkedOutOn: '2026-11-26', format: 'book', branch: branchById('central') });
  assert.equal(dueOn, '2026-12-17');
});

test('a due date that falls on a closed day moves to the next open day', () => {
  const dueOn = computeDueDate({
    checkedOutOn: '2026-11-22',
    format: 'dvd',
    branch: branchById('riverside'),
  });
  assert.equal(dueOn, '2026-12-01');
});

test('a laptop is due the next day', () => {
  const dueOn = computeDueDate({
    checkedOutOn: '2026-11-26',
    format: 'laptop',
    branch: branchById('hillcrest'),
  });
  assert.equal(dueOn, '2026-11-27');
});
