/** How long each format is lent for, in days, and how many times a loan of it may be renewed. */
export const LOAN_RULES = {
  book: { loanDays: 21, maxRenewals: 2 },
  dvd: { loanDays: 7, maxRenewals: 2 },
  magazine: { loanDays: 7, maxRenewals: 0 },
  laptop: { loanDays: 1, maxRenewals: 0 },
};

/** How many items a member of each type may have on loan at once. */
export const MAX_ITEMS_ON_LOAN = { adult: 30, junior: 10, staff: 50 };

/** How many years a new or renewed library card is valid, by member type. */
export const CARD_YEARS = { adult: 3, junior: 1, staff: 3 };
