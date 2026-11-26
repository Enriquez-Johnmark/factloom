import { matchPath } from './match-path.js';
import { fail } from './respond.js';
import { catalogRoutes } from './routes/catalog.js';
import { holdRoutes } from './routes/holds.js';
import { loanRoutes } from './routes/loans.js';
import { memberRoutes } from './routes/members.js';

/**
 * Builds the lending desk API over a store. Its handle(request) takes { method, path, query,
 * body, today } and returns { status, body }.
 */
export function createApp(store) {
  const routes = [
    ...loanRoutes(store),
    ...holdRoutes(store),
    ...memberRoutes(store),
    ...catalogRoutes(store),
  ];
  return {
    handle(request) {
      for (const route of routes) {
        if (route.method !== request.method) continue;
        const params = matchPath(route.path, request.path);
        if (params !== null) return route.handle({ ...request, params });
      }
      return fail(404, 'route-not-found', `No route for ${request.method} ${request.path}`);
    },
  };
}
