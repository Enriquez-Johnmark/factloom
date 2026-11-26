/** Records that a member paid a fee in full at the desk, and returns the paid fee. */
export function payFee(store, feeId, paidOn) {
  const fee = store.getFee(feeId);
  if (fee === undefined) throw new Error(`Unknown fee ${feeId}`);
  if (fee.paid) throw new Error(`Fee ${feeId} is already paid`);
  return store.saveFee({ ...fee, paid: true, paidOn });
}
