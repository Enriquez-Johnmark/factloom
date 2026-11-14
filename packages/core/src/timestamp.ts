import { z } from 'zod';
import { err, ok, type Result } from './result.ts';

/** UTC, fixed width: YYYY-MM-DDTHH:MM:SS.sssZ. Text order equals time order. */
export type Timestamp = string & { readonly __brand: 'Timestamp' };

const FULL_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CALENDAR_DATE_FORM = /^\d{4}-\d{2}-\d{2}$/;
const FULL_FORM_EXAMPLE = 'a UTC timestamp such as 2026-03-15T09:30:00.000Z';
const ACCEPTED_FORMS = `${FULL_FORM_EXAMPLE}, or a calendar date such as 2026-03-15`;

/**
 * Says whether a text is a timestamp: the full form, naming a moment that exists.
 * The database checks only the form, so this is the one guard against an impossible date.
 * This is the only place the brand is applied.
 */
function isTimestamp(text: string): text is Timestamp {
  if (!FULL_FORM.test(text)) return false;
  const moment = new Date(text);
  // The round trip rejects what the form allows but the calendar does not, such as 30 February
  // or hour 24, which a Date would otherwise roll over into the next day or month.
  return !Number.isNaN(moment.getTime()) && moment.toISOString() === text;
}

/** The schema of a stored timestamp. Accepts the full form only. */
export const TimestampSchema = z.custom<Timestamp>(
  (value) => typeof value === 'string' && isTimestamp(value),
  {
    error: `Expected ${FULL_FORM_EXAMPLE}.`,
  },
);

/**
 * Turns a moment into a stored timestamp. This is the only way to produce one.
 * Throws for an invalid date or a year outside 0000 to 9999: both are programming errors,
 * and a wider year would break the fixed width that makes text order equal time order.
 */
export function toTimestamp(date: Date): Timestamp {
  if (Number.isNaN(date.getTime())) throw new Error('Cannot make a timestamp from an invalid date.');
  const text = date.toISOString();
  if (!isTimestamp(text)) throw new Error(`Cannot make a timestamp outside the years 0000 to 9999: ${text}`);
  return text;
}

/**
 * Reads a date given by a caller. Accepts a full UTC timestamp, or a calendar date, which
 * means the start of that day in UTC. Anything else is `invalid_input`.
 */
export function parseDateInput(text: string): Result<Timestamp> {
  const candidate = CALENDAR_DATE_FORM.test(text) ? `${text}T00:00:00.000Z` : text;
  if (isTimestamp(candidate)) return ok(candidate);
  return err('invalid_input', `"${text}" is not a date Factloom accepts. Give ${ACCEPTED_FORMS}.`);
}
