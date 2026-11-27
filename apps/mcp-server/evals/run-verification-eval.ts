// The verification eval of FL-051: each case through the LLM verification rung, with the
// file text served by a fake repository, and a table of the answers expected against those
// given. The rate reported is the share of cases expected supported or unclear that were
// answered contradicted: the answers that would lower a true fact's confidence.
import { join } from 'node:path';
import {
  type FactWithSources,
  type LlmClient,
  ok,
  toTimestamp,
  type VerificationOutcome,
} from '@kronomind/core';
import { createLlmVerificationRung, type RepositoryReader } from '@kronomind/maintenance';
import type { VerificationAnswerName, VerificationCase } from './verification-case.ts';

export const VERIFICATION_RECORDINGS_DIRECTORY = join(import.meta.dirname, 'recordings', 'verification');
export const VERIFICATION_RECORD_COMMAND = 'pnpm --filter @kronomind/mcp-server run record:verification';

export type VerificationRow = {
  readonly name: string;
  readonly expected: VerificationAnswerName;
  /** The answer given, or `failed` when the call failed or its answer did not match the schema. */
  readonly given: VerificationAnswerName | 'failed';
};

const ANSWER_OF_OUTCOME: Readonly<Partial<Record<VerificationOutcome, VerificationAnswerName>>> = {
  confirmed: 'supported',
  contradicted: 'contradicted',
  inconclusive: 'unclear',
};

const AT = toTimestamp(new Date('2026-01-10'));

/** A fact with the case's statement, built by hand: the rung reads only its statement. */
function factOf(verificationCase: VerificationCase): FactWithSources {
  return {
    fact: {
      id: 'f-case',
      namespace: 'repo:eval',
      subjectEntityId: 'e-repo',
      predicate: 'described_as',
      object: { kind: 'value', value: 'case' },
      statement: verificationCase.statement,
      confidence: 0.9,
      validFrom: null,
      validTo: null,
      createdAt: AT,
      invalidatedAt: null,
      supersededByFactId: null,
      purgedAt: null,
    },
    subject: { id: 'e-repo', namespace: 'repo:eval', type: 'repository', name: 'shop-api', createdAt: AT },
    objectEntity: null,
    sources: [],
    archivedAt: null,
  };
}

/** A repository whose file at HEAD holds the case's text. */
function repositoryOf(verificationCase: VerificationCase): RepositoryReader {
  return {
    readHead: async () => ok('c-head'),
    isAncestorOfHead: async () => ok(true),
    pathExists: async () => ok(true),
    readContentId: async (commit) => ok(commit),
    readText: async () => ok(verificationCase.text),
    findRenamedPath: async () => ok(null),
    listCommitsTouching: async () => ok([]),
  };
}

/** Runs every case through the LLM rung, one call each, and returns a row for each. */
export async function verifyCases(
  cases: readonly VerificationCase[],
  llm: LlmClient,
): Promise<readonly VerificationRow[]> {
  const rung = createLlmVerificationRung({ llm, containsSecret: () => false, maxCalls: cases.length });
  const rows: VerificationRow[] = [];
  for (const verificationCase of cases) {
    const decision = await rung.check({
      found: factOf(verificationCase),
      anchor: { path: verificationCase.path, commit: 'c-anchor' },
      head: 'c-head',
      repository: repositoryOf(verificationCase),
    });
    if (!decision.ok) throw new Error(decision.error.message);
    const given =
      decision.value === null || decision.value.note !== null
        ? 'failed'
        : (ANSWER_OF_OUTCOME[decision.value.outcome] ?? 'failed');
    rows.push({ name: verificationCase.name, expected: verificationCase.expected, given });
  }
  return rows;
}

/** The share of cases expected supported or unclear that were answered contradicted. */
export function rateWronglyContradicted(rows: readonly VerificationRow[]): number {
  const notContradicted = rows.filter((row) => row.expected !== 'contradicted');
  if (notContradicted.length === 0) return 0;
  return notContradicted.filter((row) => row.given === 'contradicted').length / notContradicted.length;
}

/** A table of the answers expected against those given, one row per case, and the rate. */
export function formatVerificationReport(rows: readonly VerificationRow[]): string {
  const lines = rows.map(
    (row) =>
      `${row.expected === row.given ? 'MATCH' : 'DIFF '}  expected ${row.expected}, given ${row.given}  ${row.name}`,
  );
  const matched = rows.filter((row) => row.expected === row.given).length;
  lines.push(`Matched: ${matched} of ${rows.length}.`);
  lines.push(
    `Expected supported or unclear, answered contradicted: ${rateWronglyContradicted(rows).toFixed(3)}.`,
  );
  return lines.join('\n');
}
