export { actOnFeedback, FEEDBACK_CONFIDENCE_DROP, FEEDBACK_CONFIDENCE_RAISE } from './act-on-feedback.ts';
export type { JudgeConflictsDeps } from './judge-conflicts.ts';
export { judgeConflicts } from './judge-conflicts.ts';
export type { JobCounts, MaintenanceJob, MaintenanceReport } from './run-maintenance.ts';
export { MaintenanceReportSchema, runMaintenance } from './run-maintenance.ts';
export type { RepairMovedAnchorsDeps } from './repair-moved-anchors.ts';
export { repairMovedAnchors } from './repair-moved-anchors.ts';
export type { RepositoryReader } from './repository-reader.ts';
export type { ArchiveUnusedFactsDeps } from './archive-unused-facts.ts';
export {
  createLlmVerificationRung,
  MAX_LLM_CALLS_PER_RUN,
  MAX_VERIFIED_TEXT_LENGTH,
} from './create-llm-verification-rung.ts';
export { createNameCheckRung } from './create-name-check-rung.ts';
export type { CheckedValue, StructuredCheck } from './create-structured-value-rung.ts';
export { createStructuredValueRung } from './create-structured-value-rung.ts';
export { archiveUnusedFacts } from './archive-unused-facts.ts';
export type { Anchor } from './find-anchor.ts';
export {
  cosineSimilarity,
  createSimilarityStage,
  FACTS_PER_ENTITY,
  MAX_ENTITY_MATCH_CALLS_PER_RUN,
  SIMILARITY_THRESHOLD,
} from './create-similarity-stage.ts';
export type { MatchedEntity } from './entity-match-prompt.ts';
export type {
  DuplicateStage,
  EntityPair,
  FindDuplicateEntitiesDeps,
  StageDecision,
} from './find-duplicate-entities.ts';
export { findDuplicateEntities, NAME_STAGE } from './find-duplicate-entities.ts';
export type {
  RungDecision,
  Successor,
  VerificationRung,
  VerifyAnchoredFactsDeps,
} from './verify-anchored-facts.ts';
export { CONFIDENCE_STEP, VERIFICATION_INTERVAL_MS, verifyAnchoredFacts } from './verify-anchored-facts.ts';
