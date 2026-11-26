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
      handle: ({ params }) => {
        const member = store.getMember(params.id);
        const balanceCents = outstandingBalance(store, member.id);
        return ok({
          id: member.id,
          name: displayName(member),
          loanCount: store.listOpenLoans(member.id).length,
          balanceCents,
          balance: formatCents(balanceCents),
        });
      },
    },
  ];
}
