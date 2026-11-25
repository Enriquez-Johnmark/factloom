/** Parses a calendar date such as "2026-03-31" to a Date at midnight UTC. */
export function parseIsoDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) throw new Error(`Not a calendar date: ${text}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Returns the date a number of days later. */
export function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Returns the last day of the month of a date, at midnight UTC. */
export function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}
