/** Returns the demo data that `npm start` serves: a few items and members, nothing on loan. */
export function demoSeed() {
  return {
    items: [
      {
        id: 'itm_1',
        barcode: '31234000000016',
        title: 'The Hobbit',
        author: 'J. R. R. Tolkien',
        format: 'book',
        branchId: 'central',
        status: 'in-service',
        replacementCostCents: 2500,
      },
      {
        id: 'itm_2',
        barcode: '31234000000024',
        title: 'Spirited Away',
        author: 'Hayao Miyazaki',
        format: 'dvd',
        branchId: 'riverside',
        status: 'in-service',
        replacementCostCents: 1800,
      },
      {
        id: 'itm_3',
        barcode: '31234000000032',
        title: 'Chromebook 14',
        author: 'Library IT',
        format: 'laptop',
        branchId: 'hillcrest',
        status: 'in-service',
        replacementCostCents: 32000,
      },
    ],
    members: [
      {
        id: 'mem_1',
        name: 'Grace Hopper',
        email: 'grace@example.org',
        phone: '+15550100001',
        notify: 'email',
        type: 'adult',
        cardNumber: '21234000567890',
        cardExpiresOn: '2028-03-31',
        homeBranchId: 'central',
        blocked: false,
      },
      {
        id: 'mem_2',
        name: 'Tomás Rivera',
        email: 'tomas@example.org',
        phone: '+15550100002',
        notify: 'sms',
        type: 'junior',
        cardNumber: '21234000567908',
        cardExpiresOn: '2027-06-30',
        homeBranchId: 'riverside',
        blocked: false,
      },
    ],
  };
}
