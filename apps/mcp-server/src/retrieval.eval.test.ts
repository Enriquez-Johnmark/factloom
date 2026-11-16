// The retrieval eval with the real local embedder, under `pnpm eval`. It sets no bar: FL-057
// does. It is in src, beside the embedder's own eval tests, because only src may build the
// real embedder.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatRetrievalTable,
  measureRetrieval,
  RETRIEVAL_EVAL_SETTINGS,
} from '../evals/retrieval/measure-retrieval.ts';
import { readRetrievalCases } from '../evals/retrieval/retrieval-cases.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';

const cacheDirectory = join(import.meta.dirname, '..', '..', '..', '.cache', 'models');

describe('the retrieval eval with the real embedder', () => {
  it('the retrieval eval runs with the provisional settings', async () => {
    const provisional = RETRIEVAL_EVAL_SETTINGS.filter(({ name }) => name === 'provisional');
    const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: true });

    const rows = await measureRetrieval(embedder, readRetrievalCases(), provisional);

    const [overall] = rows.filter((row) => row.group === 'all');
    if (overall === undefined) throw new Error('No overall row.');
    for (const value of [overall.scores.recallAt1, overall.scores.recallAt5, overall.scores.mrrAt10]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(formatRetrievalTable(rows)).toContain('| provisional | 40 | all |');
  }, 300_000);
});
