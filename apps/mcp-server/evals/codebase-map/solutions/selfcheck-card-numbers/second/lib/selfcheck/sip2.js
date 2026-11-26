// The messages of the self-check machines: the part of SIP2 they speak, with each field written
// as a two-letter code and its value, ended by '|'. A checkout request is "11" followed by its
// fields; the reply is "12", then 1 when the item was lent or 0 when it was not, then its fields.
import { checkOutItem } from '../circulation/checkout.js';
import { findMemberByCard } from '../members/accounts.js';

/**
 * Reads a checkout request: the member's card number (field AA), without the spaces and dashes
 * some card scanners put in it, and the item's barcode (AB).
 */
export function parseCheckoutRequest(message) {
  if (!message.startsWith('11')) throw new Error('Not a checkout request');
  const fields = readFields(message.slice(2));
  return { cardNumber: (fields.get('AA') ?? '').replace(/[\s-]/g, ''), barcode: fields.get('AB') ?? '' };
}

/** Writes the reply to a checkout: the due date (AH) when the item was lent, else the reason (AF). */
export function formatCheckoutReply(result) {
  if (!result.ok) return `120|AF${result.reason}|`;
  return `121|AB${result.loan.itemId}|AH${toReceiptDate(result.loan.dueOn)}|`;
}

/** The receipt printers print a date as MM/DD/YYYY. */
function toReceiptDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

/** Handles one checkout request from a self-check machine, and returns the reply to send it. */
export function handleCheckoutMessage(store, message, today) {
  const request = parseCheckoutRequest(message);
  const member = findMemberByCard(store, request.cardNumber);
  if (member === undefined) return formatCheckoutReply({ ok: false, reason: 'unknown-member' });
  return formatCheckoutReply(checkOutItem(store, { barcode: request.barcode, memberId: member.id, today }));
}

function readFields(text) {
  const fields = new Map();
  for (const field of text.split('|')) {
    if (field.length >= 2) fields.set(field.slice(0, 2), field.slice(2));
  }
  return fields;
}
