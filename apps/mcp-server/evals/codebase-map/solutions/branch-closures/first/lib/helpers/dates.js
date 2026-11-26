// Days are calendar dates written as YYYY-MM-DD, read as UTC so that the server's time zone never
// shifts them.
const DAY_MS = 86_400_000;

function toTime(isoDate) {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

/** Returns the calendar date `days` days after `isoDate`, or before it when `days` is negative. */
export function addDays(isoDate, days) {
  return new Date(toTime(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Returns how many days `later` is after `earlier`, negative when it is before. */
export function daysBetween(earlier, later) {
  return Math.round((toTime(later) - toTime(earlier)) / DAY_MS);
}

/** Returns the day of the week of a calendar date, 0 for Sunday to 6 for Saturday. */
export function weekdayOf(isoDate) {
  return new Date(toTime(isoDate)).getUTCDay();
}

/** Tells whether a branch is open on a calendar date: not a closed weekday, not a holiday. */
export function isOpenOn(branch, isoDate) {
  return !branch.closedWeekdays.includes(weekdayOf(isoDate)) && !branch.holidays.includes(isoDate);
}

/** Returns the first date on or after `isoDate` on which the branch is open. */
export function nextOpenDay(branch, isoDate) {
  let day = isoDate;
  while (!isOpenOn(branch, day)) day = addDays(day, 1);
  return day;
}
