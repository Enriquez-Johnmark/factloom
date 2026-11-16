import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRetrievalCases } from './retrieval-cases.ts';

const SPIKE_CASES = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'spikes',
  'embedding-retrieval',
  'cases.json',
);

describe('the retrieval eval data', () => {
  it('the eval data keeps the labels of the spike', () => {
    const spike = z
      .object({ statements: z.array(z.unknown()), queries: z.array(z.unknown()) })
      .parse(JSON.parse(readFileSync(SPIKE_CASES, 'utf8')));
    const cases = readRetrievalCases();

    const statements = cases.statements.map(({ id, text }) => ({ id, text }));
    expect({ statements, queries: cases.queries }).toEqual({
      statements: spike.statements,
      queries: spike.queries,
    });
  });

  it('gives every statement a subject, and an object only where it names one', () => {
    const cases = readRetrievalCases();

    expect(cases.statements).toHaveLength(60);
    expect(cases.queries).toHaveLength(40);
    expect(cases.statements.filter((statement) => statement.object !== null)).toHaveLength(28);
  });
});
