import { branchById } from '../config/branches.js';
import { addDays, nextOpenDay } from '../helpers/dates.js';
import { fulfilNextHold } from './queue.js';

/** How many days a ready hold waits on the pickup shelf. */
export const PICKUP_DAYS = 10;

/** Returns the last day a ready hold can be collected at its pickup branch. */
export function pickupDeadline(hold) {
  return nextOpenDay(branchById(hold.pickupBranchId), addDays(hold.readyOn, PICKUP_DAYS));
}

/**
 * Marks every ready hold whose pickup deadline has passed by `today` as expired, readies the next
 * waiting hold for the same item from today, and returns the expired holds.
 */
export function expireUncollectedHolds(store, today) {
  const expired = [];
  for (const hold of store.listAllHolds()) {
    if (hold.status === 'ready' && pickupDeadline(hold) < today) {
      expired.push(store.saveHold({ ...hold, status: 'expired' }));
      fulfilNextHold(store, hold.itemId, today);
    }
  }
  return expired;
}
