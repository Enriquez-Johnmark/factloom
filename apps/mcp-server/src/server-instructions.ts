/**
 * What the server tells a host when it connects. Claude Code loads only tool names and this
 * text at the start of a session, so the important words come first, and it stays far below
 * the 4,096 characters Claude Code keeps (MCP research, "Practical constraints").
 */
export const SERVER_INSTRUCTIONS = [
  "Factloom is this repository's long-term memory: facts about the code and the project, each with when it was true, when it was learned, and where it came from.",
  'At the start of a task, and before answering a question about the project, call recall with what it is about; as_of or known_at ask about the past.',
  'Save what you are asked to remember and what you learn that lasts, such as a decision and its reason, a convention, the cause of a bug or how to build and test: record_fact for one subject, predicate and object, or remember for a text, which needs an Anthropic API key.',
  'When you find where something is in the code, record it: defined_in, the symbol as subject, its path as value, a statement of what it does, and source kind file with the path.',
  'If a stored fact is wrong or no longer true, call invalidate_fact; get_fact_history shows how it changed; give_feedback says a recalled fact was right, wrong or out of date.',
  'Never store a secret.',
].join(' ');
