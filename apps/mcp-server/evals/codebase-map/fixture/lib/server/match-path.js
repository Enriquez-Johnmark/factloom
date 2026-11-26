/**
 * Matches a path such as /loans/loan_1/renew against a pattern such as /loans/:id/renew, and
 * returns the named parts ({ id: 'loan_1' }), or null when the path does not match.
 */
export function matchPath(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index];
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(actual);
    else if (part !== actual) return null;
  }
  return params;
}
