/** Puts a member in the queue for an item. Returns { ok: true, hold } or { ok: false, reason }. */
export function placeHold(store, { itemId, memberId, pickupBranchId, today }) {
  if (store.getItem(itemId) === undefined) return { ok: false, reason: 'unknown-item' };
  if (holdQueue(store, itemId).some((hold) => hold.memberId === memberId)) {
    return { ok: false, reason: 'already-queued' };
  }
  const hold = store.saveHold({
    itemId,
    memberId,
    pickupBranchId,
    placedOn: today,
    status: 'waiting',
    readyOn: null,
  });
  return { ok: true, hold };
}

/** Returns the holds still waiting or ready for an item, the first placed first. */
export function holdQueue(store, itemId) {
  return store
    .listHolds(itemId)
    .filter((hold) => hold.status === 'waiting' || hold.status === 'ready')
    .sort(
      (first, second) => first.placedOn.localeCompare(second.placedOn) || first.id.localeCompare(second.id),
    );
}

/**
 * Makes the first waiting hold for an item ready for pickup from today, and returns it; returns
 * null when nobody is waiting.
 */
export function fulfilNextHold(store, itemId, today) {
  const next = holdQueue(store, itemId).find((hold) => hold.status === 'waiting');
  if (next === undefined) return null;
  return store.saveHold({ ...next, status: 'ready', readyOn: today });
}
