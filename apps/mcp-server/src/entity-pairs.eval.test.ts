// The entity pair eval of FL-064 under `pnpm eval`: the real embedder, and the LLM replayed
// from recordings. A missing recording fails the run and names the record command. It is in
// src because only src may build the real embedder and read the model of the task map.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import { ENTITY_PAIRS_DIRECTORY, loadEntityPairs } from '../evals/entity-pair.ts';
import {
  countMerges,
  ENTITY_RECORD_COMMAND,
  ENTITY_RECORDINGS_DIRECTORY,
  evaluateEntityPairs,
  formatEntityReport,
} from '../evals/run-entity-eval.ts';
import { DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';

const cacheDirectory = join(import.meta.dirname, '..', '..', '..', '.cache', 'models');

describe('the entity pair eval', () => {
  it('runs the stages over every pair, with no over-merge by the name stage', async () => {
    const pairs = loadEntityPairs(ENTITY_PAIRS_DIRECTORY);
    if (!pairs.ok) throw new Error(pairs.error.message);
    const llm = createRecordingLlmClient({
      directory: ENTITY_RECORDINGS_DIRECTORY,
      modelLabel: DEFAULT_LLM_MODELS.entity_matching,
      recordCommand: ENTITY_RECORD_COMMAND,
    });
    const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: true });

    const rows = await evaluateEntityPairs(pairs.value, { embedder, llm });

    console.info(`Entity pairs, model ${DEFAULT_LLM_MODELS.entity_matching}:\n${formatEntityReport(rows)}`);
    expect(rows).toHaveLength(pairs.value.length);
    expect(countMerges(rows).name.overMerges).toBe(0);
  }, 300_000);
});
