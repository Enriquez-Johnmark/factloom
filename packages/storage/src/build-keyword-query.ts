/**
 * Turns free text into an FTS5 query that matches a statement holding any of its terms, or
 * returns null when the text has no term.
 *
 * FTS5 reads some characters and words of a query as syntax: `AND`, `OR`, `NOT`, `NEAR`, `*`,
 * `-`, `:`, `^` and parentheses. A term is therefore never passed as it is. Each one is
 * written as an FTS5 string: enclosed in double quotes, with every double quote inside it
 * written twice (https://www.sqlite.org/fts5.html, section 3.1, "FTS5 Strings"). A string
 * that the tokeniser splits into several tokens, such as "better-sqlite3", is matched as a
 * phrase. The terms are joined with OR, because a question rarely has all its words in one
 * statement.
 */
export function buildKeywordQuery(text: string): string | null {
  const terms = text
    .split(/\s+/u)
    // A term with no letter and no digit holds nothing the tokeniser keeps.
    .filter((term) => /[\p{L}\p{N}]/u.test(term));
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}
