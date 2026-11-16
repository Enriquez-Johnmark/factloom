import type { Result } from '@factloom/core';
import type { ExtractionCase } from './extraction-case.ts';
import { type ExtractedFact, matchesCaseFact } from './score-extraction.ts';

/**
 * Whether an extraction case passes: the extraction step did not fail, every expected fact
 * the case marks as required was extracted, and no forbidden fact was. Precision and recall
 * do not decide it.
 */
export function decideCasePass(
  extractionCase: ExtractionCase,
  outcome: Result<readonly ExtractedFact[]>,
): boolean {
  if (!outcome.ok) return false;
  const extracted = outcome.value;
  const requiredFound = extractionCase.expected
    .filter((fact) => fact.required)
    .every((required) => extracted.some((fact) => matchesCaseFact(required, fact)));
  const forbiddenFound = (extractionCase.forbidden ?? []).some((forbidden) =>
    extracted.some((fact) => matchesCaseFact(forbidden, fact)),
  );
  return requiredFound && !forbiddenFound;
}
