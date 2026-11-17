// The verification cases of FL-051 through the LLM verification rung, answered from
// recordings: no network and no API key. A missing recording fails the run and names the
// record command. It sits in src because the model label comes from the task map of the
// Anthropic client (FL-019).
import { describe, expect, it } from 'vitest';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import {
  formatVerificationReport,
  VERIFICATION_RECORD_COMMAND,
  VERIFICATION_RECORDINGS_DIRECTORY,
  verifyCases,
} from '../evals/run-verification-eval.ts';
import { loadVerificationCases, VERIFICATION_CASES_DIRECTORY } from '../evals/verification-case.ts';
import { DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';

describe('the verification cases in replay', () => {
  it('every verification case gets an answer from the recorded model output', async () => {
    const cases = loadVerificationCases(VERIFICATION_CASES_DIRECTORY);
    if (!cases.ok) throw new Error(cases.error.message);
    const llm = createRecordingLlmClient({
      directory: VERIFICATION_RECORDINGS_DIRECTORY,
      modelLabel: DEFAULT_LLM_MODELS.verification,
      recordCommand: VERIFICATION_RECORD_COMMAND,
    });

    const rows = await verifyCases(cases.value, llm);

    const text = formatVerificationReport(rows);
    console.info(`Verification cases in replay, model ${DEFAULT_LLM_MODELS.verification}:\n${text}`);
    expect(rows).toHaveLength(cases.value.length);
    expect(rows.filter((row) => row.given === 'failed').map((row) => row.name)).toEqual([]);
  });
});
