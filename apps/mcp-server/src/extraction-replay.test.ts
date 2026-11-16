// The extraction cases of FL-029 through `remember`, answered from recordings: no network and
// no API key. A missing recording fails the run and names the record command. It sits in src
// because the model label comes from the task map of the Anthropic client (FL-019).
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { describe, expect, it } from 'vitest';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import { EXTRACTION_CASES_DIRECTORY, loadExtractionCases } from '../evals/extraction-case.ts';
import {
  createRememberExtraction,
  EXTRACTION_RECORD_COMMAND,
  EXTRACTION_RECORDINGS_DIRECTORY,
} from '../evals/remember-extraction.ts';
import { runExtractionEval } from '../evals/run-extraction-eval.ts';
import { DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';

describe('the extraction cases in replay', () => {
  it('every extraction case passes on the recorded model output', async () => {
    const cases = loadExtractionCases(EXTRACTION_CASES_DIRECTORY, softwareDevelopmentDomain);
    if (!cases.ok) throw new Error(cases.error.message);
    const llm = createRecordingLlmClient({
      directory: EXTRACTION_RECORDINGS_DIRECTORY,
      modelLabel: DEFAULT_LLM_MODELS.extraction,
      recordCommand: EXTRACTION_RECORD_COMMAND,
    });

    const { passes, text } = await runExtractionEval(cases.value, createRememberExtraction(llm));

    console.info(`Extraction cases in replay, model ${DEFAULT_LLM_MODELS.extraction}:\n${text}`);
    expect(passes.every(Boolean), text).toBe(true);
  });
});
