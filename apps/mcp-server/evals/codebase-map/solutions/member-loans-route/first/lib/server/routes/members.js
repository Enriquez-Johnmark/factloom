import { outstandingBalance } from '../../fees/balance.js';
import { formatCents } from '../../helpers/money.js';
import { displayName } from '../../members/accounts.js';
import { ok } from '../respond.js';

/** The routes about a member's account. */
export function memberRoutes(store) {
  return [
    {
      method: 'GET',
      path: '/members/:id/summary',
      handle: ({ params, today }) => {
        const member = store.getMember(params.id);
        const loans = store.listOpenLoans(member.id);
        const balanceCents = outstandingBalance(store, member.id);
        return ok({
          id: member.id,
          name: displayName(member),
          loanCount: loans.length,
          overdueCount: loans.filter((loan) => loan.dueOn < today).length,
          balanceCents,
          balance: formatCents(balanceCents),
        });
      },
    },
  ];
}
