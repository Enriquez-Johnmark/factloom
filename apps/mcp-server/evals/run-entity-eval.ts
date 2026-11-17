// The entity pair eval of FL-064: each pair of the set in a memory of its own, through the
// stages of duplicate detection in order, the name stage of FL-053 and then the similarity
// stage. It reports, for each stage, how many pairs it decided same, and the over-merges
// (expected different, decided same) and under-merges (expected same, not decided same), with
// the name similarity of every pair of one type, from which the threshold is chosen.
import { join } from 'node:path';
import {
  type ChangeSet,
  createInMemoryStore,
  type Embedder,
  type Entity,
  type LlmClient,
  toTimestamp,
} from '@factloom/core';
import { cosineSimilarity, createSimilarityStage, NAME_STAGE } from '@factloom/maintenance';
import type { EntityPairCase } from './entity-pair.ts';

export const ENTITY_RECORDINGS_DIRECTORY = join(import.meta.dirname, 'recordings', 'entities');
export const ENTITY_RECORD_COMMAND = 'pnpm --filter @factloom/mcp-server run record:entities';

const NAMESPACE = 'repo:eval';

export type EntityPairRow = {
  readonly name: string;
  readonly expected: 'same' | 'different';
  /** The stage that decided "same", or null when none did. */
  readonly decidedBy: 'name' | 'similarity' | null;
  /** What the similarity stage answered, when the pair reached it. */
  readonly similarityDecision: string | null;
  /** The cosine similarity of the two names, for a pair of one type. */
  readonly similarity: number | null;
};

/** A memory holding the pair's two entities, the first created a day before the second, with their facts. */
async function buildPairMemory(pair: EntityPairCase) {
  const store = createInMemoryStore();
  const entities: Entity[] = [];
  for (const [index, side] of [pair.first, pair.second].entries()) {
    const at = toTimestamp(new Date(Date.UTC(2026, 0, 10 + index)));
    const entity: Entity = {
      id: `e-${index}`,
      namespace: NAMESPACE,
      type: side.type,
      name: side.name,
      createdAt: at,
    };
    const changeSet: ChangeSet = {
      namespace: NAMESPACE,
      operationId: `op-${index}`,
      operation: 'remember',
      trigger: 'agent',
      reasonCode: 'stated',
      explainedBySourceId: null,
      occurredAt: at,
      changes: [
        { kind: 'create_entity', entity },
        {
          kind: 'record_source',
          source: {
            id: `s-${index}`,
            namespace: NAMESPACE,
            kind: 'agent_note',
            locator: null,
            version: null,
            content: side.facts.join(' '),
            contentHash: null,
            observedAt: at,
            createdAt: at,
            purgedAt: null,
          },
        },
        ...side.facts.map((statement, factIndex) => ({
          kind: 'record_fact' as const,
          fact: {
            id: `f-${index}-${factIndex}`,
            namespace: NAMESPACE,
            subjectEntityId: entity.id,
            predicate: 'described_as',
            object: { kind: 'value' as const, value: statement },
            statement,
            confidence: 0.9,
            validFrom: null,
            validTo: null,
            createdAt: at,
            invalidatedAt: null,
            supersededByFactId: null,
            purgedAt: null,
          },
          sourceIds: [`s-${index}`] as const,
          embedding: new Float32Array([1]),
          singleValued: false,
        })),
      ],
    };
    const committed = await store.commit(changeSet);
    if (!committed.ok) throw new Error(`${pair.name}: ${committed.error.message}`);
    entities.push(entity);
  }
  const [earlier, later] = entities;
  if (earlier === undefined || later === undefined) throw new Error(`${pair.name}: no pair was built.`);
  return { store, pair: { earlier, later } };
}

/** Runs every pair through the name stage and then the similarity stage, one memory each. */
export async function evaluateEntityPairs(
  pairs: readonly EntityPairCase[],
  deps: { readonly embedder: Embedder; readonly llm: LlmClient | null; readonly threshold?: number },
): Promise<readonly EntityPairRow[]> {
  const rows: EntityPairRow[] = [];
  for (const pairCase of pairs) {
    const { store, pair } = await buildPairMemory(pairCase);
    let similarity: number | null = null;
    if (pair.earlier.type === pair.later.type) {
      const embedded = await deps.embedder.embed([pair.earlier.name, pair.later.name], 'statement');
      if (!embedded.ok) throw new Error(embedded.error.message);
      const [first, second] = embedded.value;
      if (first !== undefined && second !== undefined) similarity = cosineSimilarity(first, second);
      const byName = await NAME_STAGE.decide(pair);
      if (byName.ok && byName.value === 'same') {
        rows.push({
          name: pairCase.name,
          expected: pairCase.expected,
          decidedBy: 'name',
          similarityDecision: null,
          similarity,
        });
        continue;
      }
    }
    const stage = createSimilarityStage({
      store,
      embedder: deps.embedder,
      llm: deps.llm,
      namespace: NAMESPACE,
      maxCalls: Number.POSITIVE_INFINITY,
      ...(deps.threshold === undefined ? {} : { threshold: deps.threshold }),
    });
    const decided = await stage.decide(pair);
    if (!decided.ok) throw new Error(decided.error.message);
    rows.push({
      name: pairCase.name,
      expected: pairCase.expected,
      decidedBy: decided.value === 'same' ? 'similarity' : null,
      similarityDecision: decided.value,
      similarity,
    });
  }
  return rows;
}

/** For each stage, the pairs it decided same, and the over-merges and under-merges. */
export function countMerges(rows: readonly EntityPairRow[]) {
  const stage = (name: 'name' | 'similarity') => {
    const decided = rows.filter((row) => row.decidedBy === name);
    return {
      decided: decided.length,
      overMerges: decided.filter((row) => row.expected === 'different').length,
    };
  };
  return {
    name: stage('name'),
    similarity: stage('similarity'),
    underMerges: rows.filter((row) => row.expected === 'same' && row.decidedBy === null).length,
  };
}

/** The report: one line per pair, the counts of each stage, and the two distributions. */
export function formatEntityReport(rows: readonly EntityPairRow[]): string {
  const lines = rows.map((row) => {
    const similarity = row.similarity === null ? 'n/a  ' : row.similarity.toFixed(3);
    return `${similarity}  expected ${row.expected.padEnd(9)} decided by ${row.decidedBy ?? 'none'} (${row.similarityDecision ?? '-'})  ${row.name}`;
  });
  const counts = countMerges(rows);
  lines.push(
    `Stage 1, name: decided ${counts.name.decided}, over-merges ${counts.name.overMerges}.`,
    `Stages 3 and 4, similarity and LLM: decided ${counts.similarity.decided}, over-merges ${counts.similarity.overMerges}.`,
    `Under-merges, all stages: ${counts.underMerges}.`,
  );
  const sims = (expected: 'same' | 'different') =>
    rows
      .filter((row) => row.expected === expected && row.similarity !== null && row.decidedBy !== 'name')
      .map((row) => (row.similarity ?? 0).toFixed(3))
      .sort()
      .join(', ');
  lines.push(
    `Similarities of same pairs past stage 1: ${sims('same')}.`,
    `Similarities of different pairs: ${sims('different')}.`,
  );
  return lines.join('\n');
}
