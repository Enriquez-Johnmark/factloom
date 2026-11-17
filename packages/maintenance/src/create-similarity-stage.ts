import {
  type Embedder,
  type Entity,
  type LlmClient,
  type MemoryStore,
  type Namespace,
  ok,
  type Result,
} from '@factloom/core';
import {
  ENTITY_MATCH_INSTRUCTIONS,
  EntityMatchAnswerSchema,
  formatEntityMatchInput,
} from './entity-match-prompt.ts';
import type { DuplicateStage, StageDecision } from './find-duplicate-entities.ts';

/**
 * The cosine similarity of two name embeddings from which a pair of one type is a candidate
 * for the LLM. Measured on 2026-11-17 on the 50 pairs of FL-064 with bge-small-en-v1.5: the
 * pairs expected the same scored 0.583 to 0.923 and those expected different 0.591 to 0.946,
 * so names alone cannot separate them and the LLM decides. Of 3,196 unrelated pairs of names
 * in the set, 13% score 0.65 or more and 57% score 0.57 or more, so 0.65 keeps the LLM calls
 * few, at the cost of the one true pair below it (OpenTelemetry and OTel, 0.583).
 */
export const SIMILARITY_THRESHOLD = 0.65;

/** The most LLM calls one run makes. The candidates beyond wait for the next run. */
export const MAX_ENTITY_MATCH_CALLS_PER_RUN = 20;

/** How many facts of each entity the LLM is shown. */
export const FACTS_PER_ENTITY = 5;

/** Cosine similarity: 1 for the same direction, 0 for unrelated. */
export function cosineSimilarity(first: Float32Array, second: Float32Array): number {
  let dot = 0;
  let firstLength = 0;
  let secondLength = 0;
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index] ?? 0;
    const b = second[index] ?? 0;
    dot += a * b;
    firstLength += a * a;
    secondLength += b * b;
  }
  if (firstLength === 0 || secondLength === 0) return 0;
  return dot / Math.sqrt(firstLength * secondLength);
}

/**
 * Stages 3 and 4 of duplicate detection, for the pairs the name stage did not decide. Stage 3:
 * the embeddings of the two names, computed in the run and held in memory, are at least
 * `threshold` similar; it only makes a candidate. Stage 4: the LLM sees both names, both types
 * and a few facts of each, and answers same, different or unsure. Only "same" merges; "unsure"
 * is reported. A pair of two types with equal names goes to stage 4 directly. With no LLM client
 * the candidates are reported, not merged. Create one for each run: it counts its calls.
 */
export function createSimilarityStage(options: {
  readonly store: MemoryStore;
  readonly embedder: Embedder;
  readonly llm: LlmClient | null;
  readonly namespace: Namespace;
  readonly threshold?: number;
  readonly maxCalls?: number;
}): DuplicateStage {
  const threshold = options.threshold ?? SIMILARITY_THRESHOLD;
  const maxCalls = options.maxCalls ?? MAX_ENTITY_MATCH_CALLS_PER_RUN;
  const vectors = new Map<string, Float32Array>();
  let calls = 0;

  /** The name embedding of each entity, computed once per run. */
  const embedNames = async (entities: readonly Entity[]): Promise<Result<readonly Float32Array[]>> => {
    const missing = entities.filter((entity) => !vectors.has(entity.id));
    if (missing.length > 0) {
      const embedded = await options.embedder.embed(
        missing.map((entity) => entity.name),
        'statement',
      );
      if (!embedded.ok) return embedded;
      missing.forEach((entity, index) => {
        const vector = embedded.value[index];
        if (vector !== undefined) vectors.set(entity.id, vector);
      });
    }
    return ok(entities.map((entity) => vectors.get(entity.id) ?? new Float32Array()));
  };

  /** Up to `FACTS_PER_ENTITY` live statements about an entity. */
  const statementsOf = async (entity: Entity): Promise<Result<readonly string[]>> => {
    const listed = await options.store.listFacts({
      namespace: options.namespace,
      subjectEntityId: entity.id,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: 'live',
      limit: FACTS_PER_ENTITY,
    });
    return listed.ok ? ok(listed.value.map(({ fact }) => fact.statement)) : listed;
  };

  return {
    name: 'similarity',
    crossType: true,
    async decide({ earlier, later }): Promise<Result<StageDecision>> {
      if (earlier.type === later.type) {
        const embedded = await embedNames([earlier, later]);
        if (!embedded.ok) return ok('failed');
        const [first, second] = embedded.value;
        if (first === undefined || second === undefined || cosineSimilarity(first, second) < threshold) {
          return ok(null);
        }
      }
      if (options.llm === null) return ok('candidate');
      if (calls >= maxCalls) return ok('deferred');
      const [earlierFacts, laterFacts] = await Promise.all([statementsOf(earlier), statementsOf(later)]);
      if (!earlierFacts.ok) return earlierFacts;
      if (!laterFacts.ok) return laterFacts;
      calls += 1;
      const answer = await options.llm.generateObject({
        task: 'entity_matching',
        instructions: ENTITY_MATCH_INSTRUCTIONS,
        input: formatEntityMatchInput(
          { name: earlier.name, type: earlier.type, facts: earlierFacts.value },
          { name: later.name, type: later.type, facts: laterFacts.value },
        ),
        schema: EntityMatchAnswerSchema,
      });
      if (!answer.ok) return ok('failed');
      if (answer.value.answer === 'same') return ok('same');
      return ok(answer.value.answer === 'unsure' ? 'candidate' : null);
    },
  };
}
