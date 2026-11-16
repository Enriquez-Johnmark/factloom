import { describe, expect, it } from 'vitest';
import { buildKeywordQuery } from './build-keyword-query.ts';

describe('buildKeywordQuery', () => {
  it('quotes each term and joins the terms with OR', () => {
    expect(buildKeywordQuery('package manager pnpm')).toBe('"package" OR "manager" OR "pnpm"');
  });

  it('returns no query for text with no term', () => {
    expect(buildKeywordQuery('')).toBeNull();
    expect(buildKeywordQuery('   \n\t ')).toBeNull();
    expect(buildKeywordQuery('* - : ( ) "')).toBeNull();
  });

  it('writes a double quote inside a term twice', () => {
    expect(buildKeywordQuery('say "hello"')).toBe('"say" OR """hello"""');
  });

  it('keeps an identifier, a package name, a path and a version as one term each', () => {
    expect(buildKeywordQuery('user_repository better-sqlite3 src/index.ts 13.1.1')).toBe(
      '"user_repository" OR "better-sqlite3" OR "src/index.ts" OR "13.1.1"',
    );
  });

  it('quotes the words that FTS5 reads as operators', () => {
    expect(buildKeywordQuery('cats AND dogs NOT NEAR birds')).toBe(
      '"cats" OR "AND" OR "dogs" OR "NOT" OR "NEAR" OR "birds"',
    );
  });
});
