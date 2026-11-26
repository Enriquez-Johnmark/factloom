import assert from 'node:assert/strict';
import test from 'node:test';
import { exportLoansCsv } from '../lib/legacy/csv-export.js';
import { countLoansByBranch } from '../lib/reports/branch-stats.js';
import { listOverdueLoans } from '../lib/reports/overdue.js';
import { ADA, BEN, BOOK, DVD, LAPTOP, sampleLoan, sampleStore, TODAY } from './sample-library.js';

const loans = [
  sampleLoan({ id: 'loan_1', item: BOOK, member: ADA, checkedOutOn: '2026-10-29', dueOn: '2026-11-19' }),
  sampleLoan({ id: 'loan_2', item: DVD, member: BEN, checkedOutOn: '2026-11-03', dueOn: '2026-11-10' }),
  sampleLoan({ id: 'loan_3', item: LAPTOP, member: ADA, checkedOutOn: '2026-11-25', dueOn: '2026-11-26' }),
];

test('lists the overdue loans, the longest overdue first', () => {
  assert.deepEqual(
    listOverdueLoans(sampleStore({ loans }), TODAY).map((loan) => loan.id),
    ['loan_2', 'loan_1'],
  );
});

test('counts the items on loan of each branch', () => {
  assert.deepEqual(countLoansByBranch(sampleStore({ loans })), { central: 1, riverside: 1, hillcrest: 1 });
});

test('exports the loans for the county as CSV', () => {
  const lines = exportLoansCsv(sampleStore({ loans })).split('\n');
  assert.equal(lines[0], 'loan,item,member,out,back');
  assert.equal(lines[1], 'loan_1,itm_book,mem_ada,2026-10-29,');
});
