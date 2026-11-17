// Records the model's answers for the judge cases of FL-041: every case runs through the
// conflict judge with the real Anthropic client, wrapped in record mode, and each answer is
// written as a recording that `pnpm check` then replays. Run by hand: it spends tokens. It sits
// in src, not evals, because it builds the Anthropic client (the precedent of
// record-extraction.ts). main.ts never loads it.
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { judgeConflicts } from '@factloom/maintenance';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import { JUDGE_CASES_DIRECTORY, loadJudgeCases } from '../evals/judge-case.ts';
import {
  formatJudgeReport,
  JUDGE_RECORD_COMMAND,
  JUDGE_RECORDINGS_DIRECTORY,
  judgeCases,
} from '../evals/run-judge-eval.ts';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === '') {
  process.stderr.write(
    'ANTHROPIC_API_KEY is not set. Set it to record the judge cases; nothing was recorded.\n',
  );
  process.exit(1);
}

const cases = loadJudgeCases(JUDGE_CASES_DIRECTORY, softwareDevelopmentDomain);
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
  directory: JUDGE_RECORDINGS_DIRECTORY,
  modelLabel: DEFAULT_LLM_MODELS.conflict_detection,
  recordCommand: JUDGE_RECORD_COMMAND,
  mode: 'record',
  inner,
});

const rows = await judgeCases(cases.value, softwareDevelopmentDomain, (input) =>
  judgeConflicts({ llm }, input),
);
process.stdout.write(
  `Judge cases, model ${DEFAULT_LLM_MODELS.conflict_detection}:\n${formatJudgeReport(rows)}\n`,
);
