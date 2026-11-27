// The LLM clients of one scenario: extraction for `remember`, and the conflict judge of
// FL-041, each answered from the scenario's recordings under its own task's model, so that a
// change of either model gives its requests new keys. The replay test and the record command
// both build them here.
import type { ConflictJudge, LlmClient } from '@kronomind/core';
import { judgeConflicts } from '@kronomind/maintenance';
import { createRecordingLlmClient } from './create-recording-llm-client.ts';
import { findScenarioRecordingsDirectory, SCENARIO_RECORD_COMMAND } from './run-scenario.ts';

/** Builds the extraction client and the judge of one scenario file, in replay or in record mode. */
export function createScenarioLlm(options: {
  readonly file: string;
  readonly extractionModel: string;
  readonly judgeModel: string;
  /** In record mode, the real client both are recorded from. */
  readonly recordFrom?: LlmClient;
}): { readonly llm: LlmClient; readonly judge: ConflictJudge } {
  const directory = findScenarioRecordingsDirectory(options.file);
  const recording = (modelLabel: string): LlmClient =>
    options.recordFrom === undefined
      ? createRecordingLlmClient({ directory, modelLabel, recordCommand: SCENARIO_RECORD_COMMAND })
      : createRecordingLlmClient({
          directory,
          modelLabel,
          recordCommand: SCENARIO_RECORD_COMMAND,
          mode: 'record',
          inner: options.recordFrom,
        });
  const judgeLlm = recording(options.judgeModel);
  return {
    llm: recording(options.extractionModel),
    judge: (input) => judgeConflicts({ llm: judgeLlm }, input),
  };
}
