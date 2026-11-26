/** The reasons a librarian may waive a fee for. */
export const WAIVER_REASONS = ['returned-in-book-drop', 'staff-error', 'hardship'];

/** Waives a fee for one of the allowed reasons, and returns the waived fee. */
export function waiveFee(store, feeId, reason) {
  if (!WAIVER_REASONS.includes(reason)) throw new Error(`Unknown waiver reason ${reason}`);
  const fee = store.getFee(feeId);
  if (fee === undefined) throw new Error(`Unknown fee ${feeId}`);
  return store.saveFee({ ...fee, waivedReason: reason });
}
