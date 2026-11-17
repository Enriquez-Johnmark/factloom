// Records the model's answers for the entity pair set of FL-064: every pair runs through the
// stages with the real embedder and the real Anthropic client, wrapped in record mode, and each
// answer is written as a recording that `pnpm eval` then replays. Run by hand: it spends
// tokens. It sits in src, not evals, because it builds the Anthropic client and the embedder.
import { join } from 'node:path';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import { ENTITY_PAIRS_DIRECTORY, loadEntityPairs } from '../evals/entity-pair.ts';
import {
  ENTITY_RECORD_COMMAND,
  ENTITY_RECORDINGS_DIRECTORY,
  evaluateEntityPairs,
  formatEntityReport,
} from '../evals/run-entity-eval.ts';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === '') {
  process.stderr.write(
    'ANTHROPIC_API_KEY is not set. Set it to record the entity pairs; nothing was recorded.\n',
  );
  process.exit(1);
}

const pairs = loadEntityPairs(ENTITY_PAIRS_DIRECTORY);
if (!pairs.ok) {
  process.stderr.write(`${pairs.error.message}\n`);
  process.exit(1);
}

const inner = createAnthropicLlmClient({
  apiKey,
  models: DEFAULT_LLM_MODELS,
  logUsage: (report) => process.stdout.write(`usage: ${JSON.stringify(report)}\n`),
  sendMessage: createAnthropicMessageSender(),
});
const llm = createRecordingLlmClient({
  directory: ENTITY_RECORDINGS_DIRECTORY,
  modelLabel: DEFAULT_LLM_MODELS.entity_matching,
  recordCommand: ENTITY_RECORD_COMMAND,
  mode: 'record',
  inner,
});
const embedder = createLocalEmbedder({
  cacheDirectory: join(import.meta.dirname, '..', '..', '..', '.cache', 'models'),
  allowDownload: true,
});

const rows = await evaluateEntityPairs(pairs.value, { embedder, llm });
process.stdout.write(
  `Entity pairs, model ${DEFAULT_LLM_MODELS.entity_matching}:\n${formatEntityReport(rows)}\n`,
);
