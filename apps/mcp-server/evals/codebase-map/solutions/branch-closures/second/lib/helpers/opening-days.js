import { addDays, weekdayOf } from './dates.js';

/**
 * Tells whether a branch is open on a calendar date: not a closed weekday, not a holiday, and not
 * within one of its closures.
 */
export function isOpenOn(branch, isoDate) {
  if (branch.closedWeekdays.includes(weekdayOf(isoDate))) return false;
  if (branch.holidays.includes(isoDate)) return false;
  return !(branch.closures ?? []).some((closure) => closure.from <= isoDate && isoDate <= closure.to);
}

/** Returns the first date on or after `isoDate` on which the branch is open. */
export function nextOpenDay(branch, isoDate) {
  let day = isoDate;
  while (!isOpenOn(branch, day)) day = addDays(day, 1);
  return day;
}
