// Records the model's answers for the extraction cases: every case runs through `remember`
// with the real Anthropic client, wrapped in record mode, and each answer is written as a
// recording that `pnpm check` then replays. Run by hand: it spends tokens. It sits in src,
// not evals, because it builds the Anthropic client, and the boundary lint keeps evals from
// importing src (the precedent of print-retrieval-eval.ts, FL-033). main.ts never loads it.
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import { EXTRACTION_CASES_DIRECTORY, loadExtractionCases } from '../evals/extraction-case.ts';
import {
  createRememberExtraction,
  EXTRACTION_RECORD_COMMAND,
  EXTRACTION_RECORDINGS_DIRECTORY,
} from '../evals/remember-extraction.ts';
import { runExtractionEval } from '../evals/run-extraction-eval.ts';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === '') {
  process.stderr.write(
    'ANTHROPIC_API_KEY is not set. Set it to record the extraction cases; nothing was recorded.\n',
  );
  process.exit(1);
}

const cases = loadExtractionCases(EXTRACTION_CASES_DIRECTORY, softwareDevelopmentDomain);
if (!cases.ok) {
  process.stderr.write(`${cases.error.message}\n`);
  process.exit(1);
}

const inner = createAnthropicLlmClient({
  apiKey,
  models: DEFAULT_LLM_MODELS,
  logUsage: (report) => process.stdout.write(`usage: ${JSON.stringify(report)}\n`),
  sendMessage: createAnthropicMessageSender(),
});
const llm = createRecordingLlmClient({
  directory: EXTRACTION_RECORDINGS_DIRECTORY,
  modelLabel: DEFAULT_LLM_MODELS.extraction,
  recordCommand: EXTRACTION_RECORD_COMMAND,
  mode: 'record',
  inner,
});

const { text } = await runExtractionEval(cases.value, createRememberExtraction(llm));
process.stdout.write(`${text}\n`);
