// The acceptance bar of FL-057, under `pnpm eval`: recall with the default settings must not
// score below the vector lane alone at recall@1, and must stay near the numbers recorded in
// ADR 0020. It is in src, beside the embedder's own eval tests, because only src may build
// the real embedder.
import { join } from 'node:path';
import { DEFAULT_RECALL_SETTINGS } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { measureRetrieval, RETRIEVAL_EVAL_SETTINGS } from '../evals/retrieval/measure-retrieval.ts';
import { readRetrievalCases } from '../evals/retrieval/retrieval-cases.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';

const cacheDirectory = join(import.meta.dirname, '..', '..', '..', '.cache', 'models');

/**
 * The defaults' scores recorded in ADR 0020, "Measurements", on the runner of the eval job
 * (Linux x64, Node.js v22.23.4). One question in 40 is 0.025: the tolerance of FL-057.
 */
const RECORDED = { recallAt1: 0.825, recallAt5: 0.887, mrrAt10: 0.849 } as const;
const TOLERANCE = 0.025;

describe('the retrieval eval with the real embedder', () => {
  it('the default settings meet the bar', async () => {
    const vectorOnly = RETRIEVAL_EVAL_SETTINGS.filter(({ name }) => name === 'vector lane only');
    const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: true });

    const rows = await measureRetrieval(embedder, readRetrievalCases(), [
      { name: 'defaults', settings: DEFAULT_RECALL_SETTINGS },
      ...vectorOnly,
    ]);

    const overall = (name: string) => {
      const row = rows.find((one) => one.settings === name && one.group === 'all');
      if (row === undefined) throw new Error(`No overall row for ${name}.`);
      return row.scores;
    };
    const defaults = overall('defaults');
    expect(defaults.recallAt1).toBeGreaterThanOrEqual(overall('vector lane only').recallAt1);
    for (const measure of ['recallAt1', 'recallAt5', 'mrrAt10'] as const) {
      expect(Math.abs(defaults[measure] - RECORDED[measure]), measure).toBeLessThanOrEqual(TOLERANCE);
    }
  }, 300_000);
});
