import { daysBetween } from '../helpers/dates.js';
import { DAILY_LATE_FEE_CENTS, GRACE_DAYS } from './schedule.js';

/** Returns the late fee in cents for a loan returned on `returnedOn`, 0 when none is due. */
export function assessLateFee({ loan, item, member, returnedOn }) {
  if (member.type === 'staff') return 0;
  const daysLate = daysBetween(loan.dueOn, returnedOn);
  if (daysLate <= GRACE_DAYS) return 0;
  return daysLate * DAILY_LATE_FEE_CENTS[item.format];
}
