import { branchById } from '../config/branches.js';
import { addDays, nextOpenDay } from '../helpers/dates.js';

/** How many days a ready hold waits on the pickup shelf. */
export const PICKUP_DAYS = 7;

/** Returns the last day a ready hold can be collected at its pickup branch. */
export function pickupDeadline(hold) {
  return nextOpenDay(branchById(hold.pickupBranchId), addDays(hold.readyOn, PICKUP_DAYS));
}

/** Marks every ready hold whose pickup deadline has passed by `today` as expired, and returns them. */
export function expireUncollectedHolds(store, today) {
  const expired = [];
  for (const hold of store.listAllHolds()) {
    if (hold.status === 'ready' && pickupDeadline(hold) < today) {
      expired.push(store.saveHold({ ...hold, status: 'expired' }));
    }
  }
  return expired;
}
