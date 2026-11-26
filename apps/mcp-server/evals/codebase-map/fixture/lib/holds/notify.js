import { branchById } from '../config/branches.js';
import { composeNotice } from '../notices/compose.js';
import { pickupDeadline } from './pickup.js';

/** Returns the notice that tells a member their hold is ready to collect. */
export function holdReadyNotice(store, hold) {
  const member = store.getMember(hold.memberId);
  const item = store.getItem(hold.itemId);
  return composeNotice('holdReady', {
    member,
    values: {
      title: item.title,
      branch: branchById(hold.pickupBranchId).name,
      deadline: pickupDeadline(hold),
    },
  });
}
