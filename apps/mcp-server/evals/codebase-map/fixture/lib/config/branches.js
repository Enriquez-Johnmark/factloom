/** The branches of the library. Weekdays are 0 for Sunday to 6 for Saturday. */
export const BRANCHES = [
  {
    id: 'central',
    name: 'Central Library',
    closedWeekdays: [0],
    holidays: ['2026-12-25', '2027-01-01', '2027-05-31'],
  },
  {
    id: 'riverside',
    name: 'Riverside Branch',
    closedWeekdays: [0, 1],
    holidays: ['2026-12-24', '2026-12-25', '2027-01-01'],
  },
  {
    id: 'hillcrest',
    name: 'Hillcrest Branch',
    closedWeekdays: [0, 6],
    holidays: ['2026-12-25', '2027-01-01'],
  },
];

/** Returns the branch with this id, and throws for an id that is not one. */
export function branchById(id) {
  const branch = BRANCHES.find((candidate) => candidate.id === id);
  if (branch === undefined) throw new Error(`Unknown branch ${id}`);
  return branch;
}
