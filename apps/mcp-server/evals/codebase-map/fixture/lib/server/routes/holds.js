import { holdQueue, placeHold } from '../../holds/queue.js';
import { fail, ok } from '../respond.js';

/** The routes of holds: placing one, and the queue of an item. */
export function holdRoutes(store) {
  return [
    {
      method: 'POST',
      path: '/holds',
      handle: ({ body, today }) => {
        const result = placeHold(store, { ...body, today });
        return result.ok
          ? ok({ hold: result.hold }, 201)
          : fail(409, result.reason, 'The hold cannot be placed');
      },
    },
    {
      method: 'GET',
      path: '/items/:id/holds',
      handle: ({ params }) => ok({ holds: holdQueue(store, params.id) }),
    },
  ];
}
