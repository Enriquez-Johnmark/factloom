// Check of the task branch-closures: no day within a branch's closure is an open day, so no loan
// falls due on one. The opening days are imported from where the teammate's move put them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDueDate } from '../lib/circulation/due-dates.js';
import { isOpenOn, nextOpenDay } from '../lib/helpers/opening-days.js';

const closedForRenovation = {
  id: 'eastgate',
  name: 'Eastgate Branch',
  closedWeekdays: [0],
  holidays: [],
  closures: [{ from: '2026-12-01', to: '2026-12-10' }],
};
const withoutClosures = { id: 'westgate', name: 'Westgate Branch', closedWeekdays: [0], holidays: [] };

test('a branch is closed on every day of a closure, both ends included', () => {
  for (const day of ['2026-12-01', '2026-12-05', '2026-12-10']) {
    assert.equal(isOpenOn(closedForRenovation, day), false, day);
  }
  assert.equal(isOpenOn(closedForRenovation, '2026-11-30'), true);
  assert.equal(isOpenOn(closedForRenovation, '2026-12-11'), true);
});

test('the next open day of a day within a closure is the day after it ends', () => {
  assert.equal(nextOpenDay(closedForRenovation, '2026-12-03'), '2026-12-11');
});

test('a loan that would fall due within a closure falls due after it', () => {
  const dueOn = computeDueDate({ checkedOutOn: '2026-11-10', format: 'book', branch: closedForRenovation });
  assert.equal(dueOn, '2026-12-11');
});

test('a branch without closures keeps its due dates', () => {
  const dueOn = computeDueDate({ checkedOutOn: '2026-11-10', format: 'book', branch: withoutClosures });
  assert.equal(dueOn, '2026-12-01');
});
