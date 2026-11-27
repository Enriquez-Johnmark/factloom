import { err, type Result } from '@kronomind/core';
import { decideCasePass } from './decide-case-pass.ts';
import type { ExtractionCase } from './extraction-case.ts';
import { formatExtractionReport } from './format-extraction-report.ts';
import { type ExtractedFact, type ExtractFacts, runExtractionCases } from './score-extraction.ts';

/**
 * Runs every case through the extraction step once, scores the set, decides pass or fail per
 * case, and formats the report. The replay test and the record command both run it.
 */
export async function runExtractionEval(cases: readonly ExtractionCase[], extract: ExtractFacts) {
  const outcomes: Result<readonly ExtractedFact[]>[] = [];
  const report = await runExtractionCases(cases, async (text, observedAt, repositoryName) => {
    // The runner calls the step once per case, in order, so the next outcome is this case's.
    const name = cases[outcomes.length]?.name ?? 'unknown';
    let outcome: Result<readonly ExtractedFact[]>;
    try {
      outcome = await extract(text, observedAt, repositoryName);
    } catch (cause) {
      throw new Error(`Case "${name}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    }
    outcomes.push(outcome);
    return outcome;
  });
  const passes = cases.map((extractionCase, index) =>
    decideCasePass(extractionCase, outcomes[index] ?? err('invalid_input', 'The case was not run.')),
  );
  return { report, passes, text: formatExtractionReport(report, passes) };
}
