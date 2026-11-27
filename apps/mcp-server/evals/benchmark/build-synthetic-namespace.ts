import {
  type Change,
  type Entity,
  err,
  type Fact,
  type MemoryStore,
  ok,
  parseDateInput,
  type Result,
  type Source,
  type Timestamp,
} from '@kronomind/core';

/** A pseudo-random number generator from a seed (mulberry32), so a namespace can be built again. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A fixed date of the generator as a timestamp. */
function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const ENDED_FROM = at('2025-01-01');
const ENDED_TO = at('2025-06-01');

const WORDS = [
  'conventional',
  'commits',
  'trunk',
  'review',
  'squash',
  'merges',
  'semantic',
  'versioning',
  'changelog',
  'feature',
  'flags',
  'pairing',
  'linting',
  'formatting',
  'typed',
  'errors',
  'small',
  'pull',
  'requests',
  'release',
  'trains',
  'canary',
  'deploys',
  'blue',
  'green',
  'rollbacks',
  'tests',
  'first',
  'ownership',
];

export type SyntheticNamespaceOptions = {
  readonly namespace: string;
  readonly size: number;
  readonly seed: number;
  readonly dimensions: number;
  /** When every row is taken to be recorded. */
  readonly createdAt: Timestamp;
  /** Facts per commit. */
  readonly batchSize?: number;
};

export type SyntheticNamespace = {
  readonly factIds: readonly string[];
  readonly firstVector: Float32Array | null;
};

/**
 * Builds a namespace of the given size through `commit`: one repository entity per 20
 * facts, facts under the multi-valued predicate `follows_convention` with worded values, one
 * source per batch, and pseudo-random vectors from the seed. A fifth of the facts have a
 * valid period that has ended, and a tenth are invalidated afterwards, so that the time
 * filter has work to do. The same options build the same rows.
 */
export async function buildSyntheticNamespace(
  store: MemoryStore,
  options: SyntheticNamespaceOptions,
): Promise<Result<SyntheticNamespace>> {
  const random = createRandom(options.seed);
  const pick = () => WORDS[Math.floor(random() * WORDS.length)] ?? 'tests';
  const batchSize = options.batchSize ?? 1000;
  const subjectCount = Math.max(1, Math.floor(options.size / 20));
  const { namespace, createdAt } = options;
  const factIds: string[] = [];
  let firstVector: Float32Array | null = null;
  for (let start = 0, batch = 0; start < options.size; start += batchSize, batch += 1) {
    const source: Source = {
      id: `bench-source-${batch}`,
      namespace,
      kind: 'agent_note',
      locator: null,
      version: null,
      content: null,
      contentHash: null,
      purgedAt: null,
      observedAt: createdAt,
      createdAt,
    };
    const changes: Change[] = [{ kind: 'record_source', source }];
    for (let index = start; index < Math.min(options.size, start + batchSize); index += 1) {
      const subject = index % subjectCount;
      if (index === subject) {
        const entity: Entity = {
          id: `bench-repo-${subject}`,
          namespace,
          type: 'repository',
          name: `repo-${subject}`,
          createdAt,
        };
        changes.push({ kind: 'create_entity', entity });
      }
      const value = `${pick()} ${pick()} ${index}`;
      const ended = index % 5 === 4;
      const fact: Fact = {
        id: `bench-fact-${index}`,
        namespace,
        subjectEntityId: `bench-repo-${subject}`,
        predicate: 'follows_convention',
        object: { kind: 'value', value },
        statement: `repo-${subject} follows ${value} for ${pick()} ${pick()}.`,
        confidence: 1,
        validFrom: ended ? ENDED_FROM : null,
        validTo: ended ? ENDED_TO : null,
        createdAt,
        invalidatedAt: null,
        purgedAt: null,
        supersededByFactId: null,
      };
      const vector = new Float32Array(options.dimensions).map(() => random() * 2 - 1);
      firstVector ??= vector;
      factIds.push(fact.id);
      changes.push({
        kind: 'record_fact',
        fact,
        sourceIds: [source.id],
        embedding: vector,
        singleValued: false,
      });
    }
    const committed = await store.commit({
      namespace,
      operationId: `bench-op-${batch}`,
      operation: 'remember',
      trigger: 'agent',
      reasonCode: 'stated',
      explainedBySourceId: source.id,
      occurredAt: createdAt,
      changes,
    });
    if (!committed.ok) return err(committed.error.code, `Batch ${batch}: ${committed.error.message}`);
  }
  const invalidations: Change[] = factIds
    .filter((_, index) => index % 10 === 3)
    .map((factId) => ({ kind: 'invalidate_fact', factId, supersededByFactId: null }));
  if (invalidations.length > 0) {
    const committed = await store.commit({
      namespace,
      operationId: 'bench-op-invalidate',
      operation: 'retraction',
      trigger: 'agent',
      reasonCode: 'reported_wrong',
      explainedBySourceId: null,
      occurredAt: createdAt,
      changes: invalidations,
    });
    if (!committed.ok) return committed;
  }
  return ok({ factIds, firstVector });
}
