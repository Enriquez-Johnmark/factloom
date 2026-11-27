/**
 * What the server tells a host when it connects. Claude Code loads only tool names and this
 * text at the start of a session, so the important words come first, and it stays far below
 * the 4,096 characters Claude Code keeps (MCP research, "Practical constraints").
 */
export const SERVER_INSTRUCTIONS = [
  "Kronomind is this repository's memory: facts about its code and project, each with when it was true, when it was learned and its source.",
  'A prompt may come with its matching facts, or a line saying there are none; if neither, call recall at the start of a task; as_of or known_at ask about the past.',
  'Save what you are asked to remember and what lasts, such as a decision, a convention, the cause of a bug or how to build and test: record_fact for one subject, predicate and object, or remember for a text (it needs an API key).',
  'When the person says why a change is made, record the reason before you finish, such as described_as on the changed symbol.',
  'Record where code is as you find it: defined_in, the symbol as subject, its path as value, what it does as statement, source kind file with the path.',
  'If a stored fact is wrong or no longer true, call invalidate_fact; get_fact_history shows how it changed; give_feedback says a recalled fact was right, wrong or outdated.',
  'Never store a secret.',
].join(' ');
