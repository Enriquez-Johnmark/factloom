import { type Timestamp, toTimestamp } from '@kronomind/core';

/**
 * What a FHIR `date` or `dateTime` names: the earliest moment it allows, and the first moment
 * after it. A FHIR date can be a year, a month, a day or an instant (R4 datatypes.html), so
 * "2026" names all of 2026: it starts on 2026-01-01 and is over on 2027-01-01.
 */
export type FhirDateBounds = {
  readonly start: Timestamp;
  /** The first moment the date no longer names: where an inclusive FHIR end becomes an exclusive one. */
  readonly after: Timestamp;
};

const PARTIAL_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
// R4 dateTime with a time: hours and minutes, optional seconds and fraction, and a zone, which R4 requires.
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** A moment in milliseconds as a Kronomind timestamp. */
function at(milliseconds: number): Timestamp {
  return toTimestamp(new Date(milliseconds));
}

/** The bounds of a year, a month or a day, read as UTC, or null when the date does not exist. */
function readPartialDate(match: RegExpExecArray): FhirDateBounds | null {
  const year = Number(match[1]);
  const month = match[2] === undefined ? null : Number(match[2]);
  const day = match[3] === undefined ? null : Number(match[3]);
  if (month === null) return { start: at(Date.UTC(year, 0, 1)), after: at(Date.UTC(year + 1, 0, 1)) };
  if (month < 1 || month > 12) return null;
  if (day === null) return { start: at(Date.UTC(year, month - 1, 1)), after: at(Date.UTC(year, month, 1)) };
  const start = Date.UTC(year, month - 1, day);
  // Date.UTC rolls 2026-02-30 over into March, so a day that does not exist is caught here.
  if (new Date(start).getUTCDate() !== day) return null;
  return { start: at(start), after: at(Date.UTC(year, month - 1, day + 1)) };
}

/**
 * Reads a FHIR `date` or `dateTime`. A date without a time is read in UTC, because FHIR gives it
 * no zone. An instant names one millisecond, the precision of a Kronomind timestamp. Returns
 * null for text that is not a FHIR date.
 */
export function readFhirDate(text: string): FhirDateBounds | null {
  const partial = PARTIAL_DATE.exec(text);
  if (partial !== null) return readPartialDate(partial);
  if (!DATE_TIME.test(text)) return null;
  const milliseconds = Date.parse(text);
  if (Number.isNaN(milliseconds)) return null;
  return { start: at(milliseconds), after: at(milliseconds + 1) };
}
