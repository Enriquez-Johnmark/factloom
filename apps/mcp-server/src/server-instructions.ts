/**
 * What the server tells a host when it connects. Claude Code loads only tool names and this
 * text at the start of a session, so the important words come first, and it stays far below
 * the 4,096 characters Claude Code keeps (MCP research, "Practical constraints").
 */
export const SERVER_INSTRUCTIONS = [
  "Factloom is this repository's long-term memory: facts about the code and the project, each with when it was true, when it was learned, and where it came from.",
  'Call recall before answering a question about the project, and pass as_of or known_at to ask about the past.',
  'When you learn something lasting, such as a dependency, a decision, a convention or how to build and test, save it: record_fact for one fact you can state as subject, predicate and object, or remember to extract facts from text.',
  'remember needs an Anthropic API key; without one, use record_fact.',
  'When a stored fact is wrong or no longer true, call invalidate_fact rather than recording a contradiction. get_fact_history shows how a fact changed and why.',
  'Never store a secret.',
].join(' ');
