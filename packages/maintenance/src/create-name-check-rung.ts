import { type FactWithSources, ok } from '@factloom/core';
import { containsWholeWord } from './contains-whole-word.ts';
import { decided, type VerificationRung } from './verify-anchored-facts.ts';

/**
 * The rung that checks that a fact's named functions or symbols are still named in its
 * anchored file at HEAD, by a whole-word search with no LLM. `namesToFind` comes from the
 * domain: the names a fact needs in its file, or none for a fact that names no symbol. A
 * missing name decides `contradicted`; a fact whose names are all found goes on to the next rung.
 */
export function createNameCheckRung(
  namesToFind: (found: FactWithSources) => readonly string[],
): VerificationRung {
  return {
    name: 'name_check',
    placement: 'before_content_check',
    async check({ found, anchor, head, repository }) {
      const names = namesToFind(found);
      if (names.length === 0) return ok(null);
      const text = await repository.readText(head, anchor.path);
      if (!text.ok) return text;
      // The path exists at HEAD, as rung 2 found; a null text here is a file git cannot show.
      if (text.value === null) return ok(null);
      const isEveryNameFound = names.every((name) => containsWholeWord(text.value ?? '', name));
      return ok(isEveryNameFound ? null : decided('contradicted'));
    },
  };
}
