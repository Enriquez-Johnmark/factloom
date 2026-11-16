// `pnpm eval:retrieval`: measures recall with the real local embedder on the eval data, for
// each entry of RETRIEVAL_EVAL_SETTINGS, and prints the table. The model is kept in
// .cache/models at the repository root, as for `pnpm eval`; the first run downloads it. It is in
// src, beside the live check of the LLM client, because only src may build the real embedder.
import { join } from 'node:path';
import {
  formatRetrievalTable,
  measureRetrieval,
  RETRIEVAL_EVAL_SETTINGS,
} from '../evals/retrieval/measure-retrieval.ts';
import { readRetrievalCases } from '../evals/retrieval/retrieval-cases.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';

const cacheDirectory = join(import.meta.dirname, '..', '..', '..', '.cache', 'models');
const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: true });

const rows = await measureRetrieval(embedder, readRetrievalCases(), RETRIEVAL_EVAL_SETTINGS);
process.stdout.write(`${formatRetrievalTable(rows)}\n`);
