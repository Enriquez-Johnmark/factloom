import type { CaseScore, ExtractionReport } from './score-extraction.ts';

const percent = (ratio: number | null): string => (ratio === null ? 'n/a' : ratio.toFixed(3));

function formatCase(score: CaseScore, passed: boolean): string {
  const counts = `expected ${score.expected}, extracted ${score.extracted}, matched ${score.matched}`;
  const extra = `forbidden ${score.forbiddenExtracted}, type differences ${score.typeDifferences}`;
  return `${passed ? 'PASS' : 'FAIL'}  ${score.name}  (${counts}; ${extra}${score.failed ? '; remember failed' : ''})`;
}

/**
 * The report of an extraction run as text: one line per case with pass or fail and the
 * scorer's counts, then the number of cases passed, precision and recall for the set. The
 * same report gives the same text, so two replayed runs print the same bytes.
 */
export function formatExtractionReport(report: ExtractionReport, passes: readonly boolean[]): string {
  const lines = report.cases.map((score, index) => formatCase(score, passes[index] ?? false));
  const passed = passes.filter(Boolean).length;
  const { total } = report;
  lines.push(
    `Cases passed: ${passed} of ${report.cases.length}.`,
    `Facts: expected ${total.expected}, extracted ${total.extracted}, matched ${total.matched}; forbidden extracted ${total.forbiddenExtracted}; type differences ${total.typeDifferences}.`,
    `Precision ${percent(total.precision)}, recall ${percent(total.recall)}.`,
  );
  return lines.join('\n');
}
