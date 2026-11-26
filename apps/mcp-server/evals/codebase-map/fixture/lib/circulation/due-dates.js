import { LOAN_RULES } from '../config/defaults.js';
import { addDays, nextOpenDay } from '../helpers/dates.js';

/**
 * Returns the day a loan of an item of this format, lent or renewed on `checkedOutOn`, falls due:
 * the end of the format's loan period, or the branch's next open day after it.
 */
export function computeDueDate({ checkedOutOn, format, branch }) {
  return nextOpenDay(branch, addDays(checkedOutOn, LOAN_RULES[format].loanDays));
}
