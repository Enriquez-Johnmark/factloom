import { createIdGenerator } from '../helpers/ids.js';

/**
 * Creates the store of the lending desk, held in memory, from lists of items, members, loans,
 * holds and fees. Every read returns a copy, so that a caller changes a record only by saving it.
 */
export function createStore({ items = [], members = [], loans = [], holds = [], fees = [] } = {}) {
  const tables = {
    items: toTable(items),
    members: toTable(members),
    loans: toTable(loans),
    holds: toTable(holds),
    fees: toTable(fees),
  };
  const nextId = {
    loans: createIdGenerator('loan'),
    holds: createIdGenerator('hold'),
    fees: createIdGenerator('fee'),
  };

  function list(table, keep = () => true) {
    return [...tables[table].values()].filter(keep).map((record) => ({ ...record }));
  }
  function get(table, id) {
    const record = tables[table].get(id);
    return record === undefined ? undefined : { ...record };
  }
  function save(table, record) {
    const saved = { ...record, id: record.id ?? nextId[table]() };
    tables[table].set(saved.id, saved);
    return { ...saved };
  }

  return {
    getItem: (id) => get('items', id),
    listItems: () => list('items'),
    findItemByBarcode: (barcode) => list('items', (item) => item.barcode === barcode)[0],
    getMember: (id) => get('members', id),
    listMembers: () => list('members'),
    getLoan: (id) => get('loans', id),
    listAllLoans: () => list('loans'),
    listOpenLoans: (memberId) =>
      list('loans', (loan) => loan.memberId === memberId && loan.returnedOn === null),
    findOpenLoan: (itemId) => list('loans', (loan) => loan.itemId === itemId && loan.returnedOn === null)[0],
    saveLoan: (loan) => save('loans', loan),
    listHolds: (itemId) => list('holds', (hold) => hold.itemId === itemId),
    listAllHolds: () => list('holds'),
    saveHold: (hold) => save('holds', hold),
    getFee: (id) => get('fees', id),
    listFees: (memberId) => list('fees', (fee) => fee.memberId === memberId),
    saveFee: (fee) => save('fees', fee),
  };
}

function toTable(records) {
  return new Map(records.map((record) => [record.id, { ...record }]));
}
