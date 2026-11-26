import { searchCatalog } from '../../catalog/search.js';
import { ok } from '../respond.js';

/** The route of catalog search: GET /catalog?q=words. */
export function catalogRoutes(store) {
  return [
    {
      method: 'GET',
      path: '/catalog',
      handle: ({ query }) => ok({ items: searchCatalog(store.listItems(), query?.q ?? '') }),
    },
  ];
}
