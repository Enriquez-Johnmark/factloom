// Records the model's answers for the verification cases of FL-051: every case runs through
// the LLM verification rung with the real Anthropic client, wrapped in record mode, and each
// answer is written as a recording that `pnpm check` then replays. Run by hand: it spends
// tokens. It sits in src, not evals, because it builds the Anthropic client (the precedent of
// record-extraction.ts). main.ts never loads it.
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import {
  formatVerificationReport,
  VERIFICATION_RECORD_COMMAND,
  VERIFICATION_RECORDINGS_DIRECTORY,
  verifyCases,
} from '../evals/run-verification-eval.ts';
import { loadVerificationCases, VERIFICATION_CASES_DIRECTORY } from '../evals/verification-case.ts';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === '') {
  process.stderr.write(
    'ANTHROPIC_API_KEY is not set. Set it to record the verification cases; nothing was recorded.\n',
  );
  process.exit(1);
}

const cases = loadVerificationCases(VERIFICATION_CASES_DIRECTORY);
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
  directory: VERIFICATION_RECORDINGS_DIRECTORY,
  modelLabel: DEFAULT_LLM_MODELS.verification,
  recordCommand: VERIFICATION_RECORD_COMMAND,
  mode: 'record',
  inner,
});

const rows = await verifyCases(cases.value, llm);
process.stdout.write(
  `Verification cases, model ${DEFAULT_LLM_MODELS.verification}:\n${formatVerificationReport(rows)}\n`,
);
