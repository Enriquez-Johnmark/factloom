import { addDays } from '../helpers/dates.js';
import { listOverdueLoans } from '../reports/overdue.js';
import { composeNotice } from './compose.js';

/** Loans due within this many days get a reminder in the morning run. */
const DUE_SOON_DAYS = 2;

/** Returns the reminders of the morning run for loans that fall due within two days of today. */
export function dueSoonNotices(store, today) {
  const until = addDays(today, DUE_SOON_DAYS);
  return store
    .listAllLoans()
    .filter((loan) => loan.returnedOn === null && loan.dueOn >= today && loan.dueOn <= until)
    .map((loan) => noticeFor(store, 'dueSoon', loan));
}

/** Returns the notices of the morning run for loans that are overdue today. */
export function overdueNotices(store, today) {
  return listOverdueLoans(store, today).map((loan) => noticeFor(store, 'overdue', loan));
}

function noticeFor(store, kind, loan) {
  const member = store.getMember(loan.memberId);
  const item = store.getItem(loan.itemId);
  return composeNotice(kind, { member, values: { title: item.title, dueOn: loan.dueOn } });
}
