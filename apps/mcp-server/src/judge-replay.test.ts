// The judge cases of FL-041 through the conflict judge, answered from recordings: no network
// and no API key. A missing recording fails the run and names the record command. It sits in
// src because the model label comes from the task map of the Anthropic client (FL-019).
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { judgeConflicts } from '@factloom/maintenance';
import { describe, expect, it } from 'vitest';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import { JUDGE_CASES_DIRECTORY, loadJudgeCases } from '../evals/judge-case.ts';
import {
  formatJudgeReport,
  JUDGE_RECORD_COMMAND,
  JUDGE_RECORDINGS_DIRECTORY,
  judgeCases,
} from '../evals/run-judge-eval.ts';
import { DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';

describe('the judge cases in replay', () => {
  it('every candidate of every judge case gets a verdict from the recorded model output', async () => {
    const cases = loadJudgeCases(JUDGE_CASES_DIRECTORY, softwareDevelopmentDomain);
    if (!cases.ok) throw new Error(cases.error.message);
    const llm = createRecordingLlmClient({
      directory: JUDGE_RECORDINGS_DIRECTORY,
      modelLabel: DEFAULT_LLM_MODELS.conflict_detection,
      recordCommand: JUDGE_RECORD_COMMAND,
    });

    const rows = await judgeCases(cases.value, softwareDevelopmentDomain, (input) =>
      judgeConflicts({ llm }, input),
    );

    const text = formatJudgeReport(rows);
    console.info(`Judge cases in replay, model ${DEFAULT_LLM_MODELS.conflict_detection}:\n${text}`);
    expect(rows).toHaveLength(cases.value.reduce((sum, judgeCase) => sum + judgeCase.candidates.length, 0));
  });
});
