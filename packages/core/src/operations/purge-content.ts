import type { Change } from '../change-set.ts';
import type { Fact, FactId, FactWithSources, Namespace, SourceId } from '../fact.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';

export type PurgeContentInput = ChangeContext & { readonly sourceId: SourceId };

/** What one purge covers (ADR 0012, "The phase 2 design", questions 1 to 3). */
type PurgeSet = {
  readonly sources: readonly SourceId[];
  readonly facts: readonly FactWithSources[];
  readonly explaining: readonly SourceId[];
};

const UNLIMITED = 10_000;

function unwrap<Value>(result: Result<Value>): Value {
  if (!result.ok) throw new PurgeReadFailed(result);
  return result.value;
}

/** A failed read while the purge set is collected; turned back into its `Result`. */
class PurgeReadFailed extends Error {
  readonly result: Result<never>;
  constructor(result: Result<never>) {
    super('A read failed while the purge set was collected.');
    this.result = result;
  }
}

/** Whether two facts state the same thing: the same subject, predicate and object. */
function isCopy(first: Fact, second: Fact): boolean {
  return (
    first.subjectEntityId === second.subjectEntityId &&
    first.predicate === second.predicate &&
    JSON.stringify(first.object) === JSON.stringify(second.object)
  );
}

/** The facts linked to a fact by supersession in either direction. */
async function readNeighbours(store: MemoryStore, namespace: Namespace, found: FactWithSources) {
  const neighbours = [
    ...unwrap(
      await store.listFacts({
        namespace,
        subjectEntityId: null,
        predicate: null,
        touchingEntityIds: null,
        supersededByFactId: found.fact.id,
        time: 'all',
        limit: UNLIMITED,
      }),
    ),
  ];
  if (found.fact.supersededByFactId !== null) {
    const next = unwrap(await store.getFact({ namespace, factId: found.fact.supersededByFactId }));
    if (next !== null) neighbours.push(next);
  }
  return neighbours;
}

/**
 * Collects the purge set of a source: it and every source with the same content hash; every
 * fact whose sources are all among them, and every copy of one, a copy being a fact linked by
 * supersession with the same subject, predicate and object; and the sources that explained a
 * change to those facts, or that hold feedback on them.
 */
async function findPurgeSet(
  store: MemoryStore,
  namespace: Namespace,
  target: { readonly id: SourceId; readonly contentHash: string | null },
): Promise<PurgeSet> {
  const sources = new Set<SourceId>([target.id]);
  if (target.contentHash !== null) {
    for (const same of unwrap(
      await store.findSourcesByContentHash({ namespace, contentHash: target.contentHash }),
    )) {
      sources.add(same.id);
    }
  }
  const facts = new Map<FactId, FactWithSources>();
  for (const found of unwrap(await store.listFactsOfSources({ namespace, sourceIds: [...sources] }))) {
    if (found.sources.every((source) => sources.has(source.id))) facts.set(found.fact.id, found);
  }
  const queue = [...facts.values()];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const neighbour of await readNeighbours(store, namespace, next)) {
      if (!facts.has(neighbour.fact.id) && isCopy(neighbour.fact, next.fact)) {
        facts.set(neighbour.fact.id, neighbour);
        queue.push(neighbour);
      }
    }
  }
  const explaining = new Set<SourceId>();
  for (const factId of facts.keys()) {
    for (const entry of unwrap(
      await store.listAuditEntries({ namespace, targetKind: 'fact', targetId: factId }),
    )) {
      if (entry.sourceId !== null) explaining.add(entry.sourceId);
    }
    for (const feedback of unwrap(await store.listFeedback({ namespace, factId }))) {
      if (feedback.sourceId !== null) explaining.add(feedback.sourceId);
    }
  }
  for (const id of sources) explaining.delete(id);
  return { sources: [...sources], facts: [...facts.values()], explaining: [...explaining] };
}

/**
 * Removes the content of a source, in one commit, as ADR 0012 designs it: the source and
 * every source with the same text; every fact that came only from them, and every copy of
 * one; and the content of every source that explained a change to those facts. Purged text
 * becomes `PURGED_MARKER`, a live purged fact is also invalidated, and its keyword and vector
 * entries are removed. Rows, identifiers, links and audit entries stay. Facts that came only
 * from an explaining source are left, as orphaned facts. Purging what is already purged
 * changes nothing and writes no audit entry.
 *
 * What this does not remove (ADR 0012, "What purge does not remove"): freed pages of the
 * database file and its write-ahead log until `clearFreedPages` of `@kronomind/storage` runs,
 * backups and copies of the file, entity names, and what was sent to the LLM provider.
 */
export async function purgeContent(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: PurgeContentInput,
): Promise<
  Result<{ readonly purgedSourceIds: readonly SourceId[]; readonly purgedFactIds: readonly FactId[] }>
> {
  const { namespace } = input;
  let set: PurgeSet;
  const sourceStates = new Map<SourceId, boolean>();
  try {
    const target = unwrap(await deps.store.getSource({ namespace, sourceId: input.sourceId }));
    if (target === null) return err('not_found', `No source ${input.sourceId} in this namespace.`);
    set = await findPurgeSet(deps.store, namespace, target);
    for (const sourceId of [...set.sources, ...set.explaining]) {
      const source = unwrap(await deps.store.getSource({ namespace, sourceId }));
      sourceStates.set(sourceId, source?.purgedAt !== null);
    }
  } catch (cause) {
    if (cause instanceof PurgeReadFailed) return cause.result;
    throw cause;
  }

  const changes: Change[] = [];
  for (const { fact } of set.facts) {
    if (fact.purgedAt !== null) continue;
    if (fact.invalidatedAt === null) {
      changes.push({ kind: 'invalidate_fact', factId: fact.id, supersededByFactId: null });
    }
    changes.push({ kind: 'purge_content', targetKind: 'fact', targetId: fact.id });
  }
  for (const [sourceId, isPurged] of sourceStates) {
    if (!isPurged) changes.push({ kind: 'purge_content', targetKind: 'source', targetId: sourceId });
  }
  const result = {
    purgedSourceIds: [...sourceStates.keys()],
    purgedFactIds: set.facts.map(({ fact }) => fact.id),
  };
  if (changes.length === 0) return ok(result);

  const committed = await deps.store.commit({
    namespace,
    operationId: deps.newId(),
    operation: 'purge',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: deps.now(),
    changes,
  });
  if (!committed.ok) return committed;
  return ok(result);
}
