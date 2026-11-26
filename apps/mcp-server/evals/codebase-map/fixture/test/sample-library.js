// The sample library the tests share: four items, three members, nothing on loan.
import { createStore } from '../lib/store/memory-store.js';

export const TODAY = '2026-11-26';

export const BOOK = {
  id: 'itm_book',
  barcode: '31234000000016',
  title: 'The Left Hand of Darkness',
  author: 'Ursula K. Le Guin',
  format: 'book',
  branchId: 'central',
  status: 'in-service',
  replacementCostCents: 2200,
};
export const DVD = {
  id: 'itm_dvd',
  barcode: '31234000000024',
  title: 'Spirited Away',
  author: 'Hayao Miyazaki',
  format: 'dvd',
  branchId: 'riverside',
  status: 'in-service',
  replacementCostCents: 1800,
};
export const LAPTOP = {
  id: 'itm_laptop',
  barcode: '31234000000032',
  title: 'Chromebook 14',
  author: 'Library IT',
  format: 'laptop',
  branchId: 'hillcrest',
  status: 'in-service',
  replacementCostCents: 32000,
};
export const MAGAZINE = {
  id: 'itm_magazine',
  barcode: '31234000000040',
  title: 'National Geographic, November 2026',
  author: 'National Geographic Society',
  format: 'magazine',
  branchId: 'central',
  status: 'in-service',
  replacementCostCents: 900,
};

export const ADA = {
  id: 'mem_ada',
  name: 'Ada Okafor',
  email: 'ada@example.org',
  phone: '+15550100001',
  notify: 'email',
  type: 'adult',
  cardNumber: '21234000567890',
  cardExpiresOn: '2028-03-31',
  homeBranchId: 'central',
  blocked: false,
};
export const BEN = {
  id: 'mem_ben',
  name: 'Benjamin Hale',
  preferredName: 'Ben',
  email: 'ben@example.org',
  phone: '+15550100002',
  notify: 'sms',
  type: 'junior',
  cardNumber: '21234000567908',
  cardExpiresOn: '2027-06-30',
  homeBranchId: 'riverside',
  blocked: false,
};
export const CY = {
  id: 'mem_cy',
  name: 'Cy Moreno',
  email: 'cy@example.org',
  phone: '+15550100003',
  notify: 'email',
  type: 'staff',
  cardNumber: '21234000567916',
  cardExpiresOn: '2029-01-31',
  homeBranchId: 'hillcrest',
  blocked: false,
};

/** Returns a store with the sample items and members, and any more items, loans, holds and fees given. */
export function sampleStore({ items = [], loans = [], holds = [], fees = [] } = {}) {
  return createStore({
    items: [BOOK, DVD, LAPTOP, MAGAZINE, ...items],
    members: [ADA, BEN, CY],
    loans,
    holds,
    fees,
  });
}

/** Returns a loan of an item to a member, not returned, with the dates given. */
export function sampleLoan({ id, item, member, checkedOutOn, dueOn, renewals = 0 }) {
  return { id, itemId: item.id, memberId: member.id, checkedOutOn, dueOn, renewals, returnedOn: null };
}
