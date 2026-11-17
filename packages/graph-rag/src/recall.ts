import {
  type EntityId,
  err,
  type FactWithSources,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  type TimeFilter,
  type Timestamp,
} from '@factloom/core';
import { fuseRanks } from './fuse-ranks.ts';

export type RecallInput = {
  readonly namespace: Namespace;
  readonly question: string;
  /** The as-of date. Defaults to the known-at date when that is given, and to now otherwise. */
  readonly validAt: Timestamp | null;
  /** The known-at date. Defaults to now. */
  readonly knownAt: Timestamp | null;
  readonly limit: number;
};

export type RecalledFact = FactWithSources & {
  /** Rank-fusion result. How well the fact matches the question, not how true it is. */
  readonly score: number;
};

/** How the three retrieval lanes are asked and how much say each has in rank fusion. */
export type RecallSettings = {
  readonly laneWeights: { readonly vector: number; readonly keyword: number; readonly graph: number };
  /** How many facts the vector and keyword lanes are asked for. */
  readonly laneListLength: number;
  /** The constant `k` of reciprocal rank fusion. */
  readonly fusionConstant: number;
};

/**
 * The default settings, chosen by measurement on the retrieval eval set (ADR 0020): the
 * keyword lane at half the weight of the vector lane, the graph lane at weight 0, and a
 * fusion constant of 1. 50 is the largest limit the recall tool accepts.
 */
export const DEFAULT_RECALL_SETTINGS: RecallSettings = {
  laneWeights: { vector: 1, keyword: 0.5, graph: 0 },
  laneListLength: 50,
  fusionConstant: 1,
};

/** The most facts the graph lane reads, so an entity that most facts touch cannot make the read unbounded (Q-14). */
const GRAPH_LANE_READ_LIMIT = 200;

/** The as-of and known-at dates of a recall, with their defaults applied. */
function buildTimeFilter(input: RecallInput, now: Timestamp): TimeFilter {
  const knownAt = input.knownAt ?? now;
  return { knownAt, validAt: input.validAt ?? knownAt };
}

/** The entities a fact touches: its subject, and its object when that is an entity. */
function entitiesOf(fact: FactWithSources): EntityId[] {
  const { subjectEntityId, object } = fact.fact;
  return object.kind === 'entity' && object.entityId !== subjectEntityId
    ? [subjectEntityId, object.entityId]
    : [subjectEntityId];
}

/**
 * The graph lane: the facts that pass the time filter and touch an entity of the facts the
 * other lanes found, ranked by how many of those entities each touches, then by how recently
 * it was recorded, then by identifier. A purged fact is left out.
 */
export async function searchFactsByGraph(
  deps: Pick<OperationDeps, 'store'>,
  query: {
    readonly namespace: Namespace;
    readonly time: TimeFilter;
    readonly found: readonly FactWithSources[];
  },
): Promise<Result<readonly FactWithSources[]>> {
  const seeds = new Set(query.found.flatMap(entitiesOf));
  if (seeds.size === 0) return ok([]);
  const touching = await deps.store.listFacts({
    namespace: query.namespace,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: [...seeds],
    supersededByFactId: null,
    time: query.time,
    limit: GRAPH_LANE_READ_LIMIT,
  });
  if (!touching.ok) return touching;
  const touchedSeeds = (fact: FactWithSources): number =>
    entitiesOf(fact).filter((entityId) => seeds.has(entityId)).length;
  // A purged fact has no keyword or vector entry, and the graph lane leaves it out as well
  // (ADR 0012, "The phase 2 design", question 5): its text is the marker.
  const ranked = touching.value
    .filter((found) => found.fact.purgedAt === null)
    .sort(
      (a, b) =>
        touchedSeeds(b) - touchedSeeds(a) ||
        b.fact.createdAt.localeCompare(a.fact.createdAt) ||
        a.fact.id.localeCompare(b.fact.id),
    );
  return ok(ranked);
}

/**
 * Recall with explicit settings: runs the vector and keyword lanes, then the graph lane from
 * what they found, all with one time filter, and merges the three by weighted rank fusion.
 */
export async function recallWithSettings(
  deps: Pick<OperationDeps, 'store' | 'embedder' | 'now'>,
  input: RecallInput,
  settings: RecallSettings,
): Promise<Result<{ readonly facts: readonly RecalledFact[] }>> {
  if (input.question.trim() === '') return err('invalid_input', 'The question is empty. Ask something.');
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    return err(
      'invalid_input',
      `The limit must be a whole number of 1 or more, and ${input.limit} was given.`,
    );
  }
  const { namespace } = input;
  const time = buildTimeFilter(input, deps.now());
  const laneLimit = settings.laneListLength;

  const embedded = await deps.embedder.embed([input.question], 'question');
  if (!embedded.ok) return embedded;
  const [vector] = embedded.value;
  if (vector === undefined)
    return err('embedding_failed', 'The embedder returned no vector for the question.');

  const byVector = await deps.store.searchFactsByVector({ namespace, vector, time, limit: laneLimit });
  if (!byVector.ok) return byVector;
  const byKeyword = await deps.store.searchFactsByKeyword({
    namespace,
    text: input.question,
    time,
    limit: laneLimit,
  });
  if (!byKeyword.ok) return byKeyword;
  const byGraph = await searchFactsByGraph(deps, {
    namespace,
    time,
    found: [...byVector.value, ...byKeyword.value],
  });
  if (!byGraph.ok) return byGraph;

  const { laneWeights } = settings;
  const fused = fuseRanks({
    lists: [
      { ids: byVector.value.map((found) => found.fact.id), weight: laneWeights.vector },
      { ids: byKeyword.value.map((found) => found.fact.id), weight: laneWeights.keyword },
      { ids: byGraph.value.map((found) => found.fact.id), weight: laneWeights.graph },
    ],
    k: settings.fusionConstant,
  });
  if (!fused.ok) return fused;

  const foundById = new Map(
    [...byVector.value, ...byKeyword.value, ...byGraph.value].map((found) => [found.fact.id, found]),
  );
  const facts = fused.value.slice(0, input.limit).flatMap(({ id, score }) => {
    const found = foundById.get(id);
    return found === undefined ? [] : [{ ...found, score }];
  });
  return ok({ facts });
}

/**
 * Answers a question with the facts that match it, filtered by time, best first. With no
 * date the facts are current; with an as-of date they were true then; with a known-at date
 * they are what Factloom believed then. Each fact comes with its sources and a score. Writes
 * nothing.
 */
export async function recall(
  deps: Pick<OperationDeps, 'store' | 'embedder' | 'now'>,
  input: RecallInput,
): Promise<Result<{ readonly facts: readonly RecalledFact[] }>> {
  // A caller who asks for more facts than the lanes' usual length gets lanes that long. The
  // internal function takes its settings as given, so a test or the retrieval eval can set the
  // lane length on its own.
  const laneListLength = Math.max(DEFAULT_RECALL_SETTINGS.laneListLength, input.limit);
  return recallWithSettings(deps, input, { ...DEFAULT_RECALL_SETTINGS, laneListLength });
}
