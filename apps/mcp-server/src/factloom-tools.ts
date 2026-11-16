import type { RegisterTool } from './create-factloom-server.ts';
import { registerRecallTool } from './recall-tool.ts';
import { registerRecordFactTool } from './record-fact-tool.ts';
import { registerRememberTool } from './remember-tool.ts';

/** The tools the server lists, in the order `tools/list` returns them. */
export const FACTLOOM_TOOLS: readonly RegisterTool[] = [
  registerRecallTool,
  registerRememberTool,
  registerRecordFactTool,
];
