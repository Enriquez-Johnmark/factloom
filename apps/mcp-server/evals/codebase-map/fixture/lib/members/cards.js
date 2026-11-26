import { CARD_YEARS } from '../config/defaults.js';

/** Tells whether a member's library card has expired by `today`. */
export function isCardExpired(member, today) {
  return member.cardExpiresOn < today;
}

/** Returns the member with their card renewed from today for the years their type allows. */
export function renewCard(member, today) {
  const year = Number(today.slice(0, 4)) + CARD_YEARS[member.type];
  return { ...member, cardExpiresOn: `${year}${today.slice(4)}` };
}
