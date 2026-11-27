import type { RegisterTool } from './create-kronomind-server.ts';
import { registerGetFactHistoryTool } from './get-fact-history-tool.ts';
import { registerGiveFeedbackTool } from './give-feedback-tool.ts';
import { registerInvalidateFactTool } from './invalidate-fact-tool.ts';
import { registerRecallTool } from './recall-tool.ts';
import { registerRecordFactTool } from './record-fact-tool.ts';
import { registerRememberTool } from './remember-tool.ts';

/** The tools the server lists, in the order `tools/list` returns them. */
export const KRONOMIND_TOOLS: readonly RegisterTool[] = [
  registerRecallTool,
  registerRememberTool,
  registerRecordFactTool,
  registerInvalidateFactTool,
  registerGetFactHistoryTool,
  registerGiveFeedbackTool,
];
