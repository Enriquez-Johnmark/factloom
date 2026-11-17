/** A character that can be part of an identifier in most languages. */
const IDENTIFIER_CHARACTER = /[\p{L}\p{N}_$]/u;

/**
 * Whether a text holds a name as a whole word, with its case kept: the characters just before
 * and just after it are not identifier characters, so `parseDate` is not found in
 * `parseDateInput`. A name in a comment or a string counts as found, which is the stated
 * limit of a word search.
 */
export function containsWholeWord(text: string, name: string): boolean {
  if (name === '') return false;
  for (let index = text.indexOf(name); index !== -1; index = text.indexOf(name, index + 1)) {
    const before = text[index - 1];
    const after = text[index + name.length];
    const isBoundedBefore = before === undefined || !IDENTIFIER_CHARACTER.test(before);
    const isBoundedAfter = after === undefined || !IDENTIFIER_CHARACTER.test(after);
    if (isBoundedBefore && isBoundedAfter) return true;
  }
  return false;
}
