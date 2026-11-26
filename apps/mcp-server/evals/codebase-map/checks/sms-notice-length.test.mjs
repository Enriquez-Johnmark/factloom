// Check of the task sms-notice-length: a notice by text message is cut to 157 characters and
// '...' when it is longer than 160, and a notice by email is left whole. It compares the two
// channels, so that it does not depend on the wording of the notices.
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeNotice } from '../lib/notices/compose.js';

const byEmail = {
  id: 'mem_check',
  name: 'Check Member',
  email: 'check@example.org',
  phone: '+15550109999',
  notify: 'email',
  type: 'adult',
};
const bySms = { ...byEmail, notify: 'sms' };
const longTitle =
  'The Collected Short Stories, Letters, Essays and Unfinished Fragments of a Very Prolific Author, With an Introduction';
const longValues = {
  title: longTitle,
  branch: 'Central Library',
  deadline: '2026-12-03',
  dueOn: '2026-11-20',
};
const shortValues = { title: 'Emma', branch: 'Central Library', deadline: '2026-12-03', dueOn: '2026-11-20' };

test('cuts a long text message to its first 157 characters and three dots', () => {
  for (const kind of ['holdReady', 'overdue']) {
    const email = composeNotice(kind, { member: byEmail, values: longValues });
    const sms = composeNotice(kind, { member: bySms, values: longValues });
    assert.ok(email.body.length > 160, `the ${kind} notice of the check is too short to test`);
    assert.equal(sms.body, `${email.body.slice(0, 157)}...`, kind);
  }
});

test('leaves a long email whole', () => {
  const email = composeNotice('holdReady', { member: byEmail, values: longValues });
  assert.ok(email.body.includes(longTitle));
});

test('leaves a short text message as it is', () => {
  const email = composeNotice('holdReady', { member: byEmail, values: shortValues });
  const sms = composeNotice('holdReady', { member: bySms, values: shortValues });
  assert.ok(sms.body.length <= 160);
  assert.equal(sms.body, email.body);
});
