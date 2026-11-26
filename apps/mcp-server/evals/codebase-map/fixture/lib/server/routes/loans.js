import { isValidBarcode, normaliseBarcode } from '../../catalog/barcodes.js';
import { checkOutItem } from '../../circulation/checkout.js';
import { renewLoan } from '../../circulation/renewals.js';
import { returnItem } from '../../circulation/returns.js';
import { fail, ok } from '../respond.js';

/** The routes of checkouts, returns and renewals. */
export function loanRoutes(store) {
  return [
    {
      method: 'POST',
      path: '/checkouts',
      handle: ({ body, today }) => {
        if (!isValidBarcode(normaliseBarcode(body.barcode)))
          return fail(400, 'invalid-barcode', 'Not a barcode');
        const result = checkOutItem(store, { barcode: body.barcode, memberId: body.memberId, today });
        return result.ok
          ? ok({ loan: result.loan }, 201)
          : fail(409, result.reason, 'The item cannot be lent');
      },
    },
    {
      method: 'POST',
      path: '/returns',
      handle: ({ body, today }) => {
        const result = returnItem(store, { barcode: body.barcode, today });
        return result.ok
          ? ok({ loan: result.loan, feeCents: result.feeCents })
          : fail(409, result.reason, 'No loan');
      },
    },
    {
      method: 'POST',
      path: '/loans/:id/renew',
      handle: ({ params, today }) => {
        const result = renewLoan(store, { loanId: params.id, today });
        return result.ok ? ok({ loan: result.loan }) : fail(409, result.reason, 'The loan cannot be renewed');
      },
    },
  ];
}
