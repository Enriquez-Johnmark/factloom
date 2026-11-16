// The harness with the fake embedder of core, so that it runs in `pnpm check`. The real
// embedder runs in src/retrieval.eval.test.ts, under `pnpm eval`.
import { createFakeEmbedder } from '@factloom/core';
import { PROVISIONAL_RECALL_SETTINGS } from '@factloom/graph-rag';
import { describe, expect, it } from 'vitest';
import {
  loadStatements,
  measureRetrieval,
  RETRIEVAL_EVAL_SETTINGS,
  rankStatements,
} from './measure-retrieval.ts';
import { readRetrievalCases } from './retrieval-cases.ts';

describe('the retrieval eval harness', () => {
  it('a lane with weight zero contributes no fact', async () => {
    const embedder = createFakeEmbedder();
    const cases = readRetrievalCases();
    const memory = await loadStatements(embedder, cases);
    const vectorOnly = { ...PROVISIONAL_RECALL_SETTINGS, laneWeights: { vector: 1, keyword: 0, graph: 0 } };

    for (const query of cases.queries) {
      const embedded = await embedder.embed([query.text], 'question');
      const [vector] = embedded.ok ? embedded.value : [];
      if (vector === undefined) throw new Error('No vector for the question.');
      const lane = await memory.deps.store.searchFactsByVector({
        namespace: 'repo:harborlight',
        vector,
        time: { validAt: memory.deps.now(), knownAt: memory.deps.now() },
        limit: 10,
      });
      if (!lane.ok) throw new Error(lane.error.message);

      const ranked = await rankStatements(memory, query.text, vectorOnly);

      expect(ranked, query.id).toEqual(lane.value.map(({ fact }) => memory.statementOfFact.get(fact.id)));
    }
    await memory.deps.store.close();
  });

  it('reports every group for every entry of the settings', async () => {
    const rows = await measureRetrieval(createFakeEmbedder(), readRetrievalCases(), RETRIEVAL_EVAL_SETTINGS);

    expect(rows.map((row) => `${row.settings}/${row.group}/${row.questions}`)).toEqual(
      RETRIEVAL_EVAL_SETTINGS.flatMap(({ name }) => [
        `${name}/all/40`,
        `${name}/paraphrase/15`,
        `${name}/keyword/10`,
        `${name}/why/10`,
        `${name}/hard/5`,
      ]),
    );
  });
});
