import { daysBetween } from '../helpers/dates.js';
import { DAILY_LATE_FEE_CENTS, GRACE_DAYS } from './schedule.js';

/** Members of these types are never charged a late fee. */
const FEE_FREE_TYPES = ['staff', 'junior'];

/** Returns the late fee in cents for a loan returned on `returnedOn`, 0 when none is due. */
export function assessLateFee({ loan, item, member, returnedOn }) {
  if (FEE_FREE_TYPES.includes(member.type)) return 0;
  const daysLate = daysBetween(loan.dueOn, returnedOn);
  if (daysLate <= GRACE_DAYS) return 0;
  return daysLate * DAILY_LATE_FEE_CENTS[item.format];
}
