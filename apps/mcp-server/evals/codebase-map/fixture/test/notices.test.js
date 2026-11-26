import assert from 'node:assert/strict';
import test from 'node:test';
import { composeNotice } from '../lib/notices/compose.js';
import { dueSoonNotices, overdueNotices } from '../lib/notices/digest.js';
import { ADA, BEN, BOOK, DVD, sampleLoan, sampleStore, TODAY } from './sample-library.js';

test('a notice by email goes to the email address, with a subject', () => {
  const notice = composeNotice('dueSoon', {
    member: ADA,
    values: { title: BOOK.title, dueOn: '2026-11-27' },
  });
  assert.equal(notice.channel, 'email');
  assert.equal(notice.to, ADA.email);
  assert.equal(notice.subject, 'An item is due soon');
  assert.match(notice.body, /^Hello Ada Okafor, "The Left Hand of Darkness" is due back on 2026-11-27\./);
});

test('a notice by text message goes to the phone number, greets by the preferred name and has no subject', () => {
  const notice = composeNotice('dueSoon', { member: BEN, values: { title: DVD.title, dueOn: '2026-11-27' } });
  assert.equal(notice.channel, 'sms');
  assert.equal(notice.to, BEN.phone);
  assert.equal(notice.subject, null);
  assert.match(notice.body, /^Hello Ben,/);
});

test('the morning run reminds members of loans due within two days, and of overdue loans', () => {
  const store = sampleStore({
    loans: [
      sampleLoan({ id: 'loan_1', item: BOOK, member: ADA, checkedOutOn: '2026-11-07', dueOn: '2026-11-28' }),
      sampleLoan({ id: 'loan_2', item: DVD, member: BEN, checkedOutOn: '2026-11-12', dueOn: '2026-11-19' }),
    ],
  });
  assert.deepEqual(
    dueSoonNotices(store, TODAY).map((notice) => notice.to),
    [ADA.email],
  );
  assert.deepEqual(
    overdueNotices(store, TODAY).map((notice) => notice.to),
    [BEN.phone],
  );
});
