import {
  type AuditEntry,
  err,
  type FactId,
  type FactWithSources,
  type MemoryStore,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  type SourceId,
} from '@kronomind/core';

/** An audit entry with the content of the source that explains it, or null if there is none or it was purged. */
export type ExplainedAuditEntry = AuditEntry & { readonly explanation: string | null };

/** One fact of a history, with its sources and the audit entries whose target it is, oldest first. */
export type FactHistoryEntry = FactWithSources & { readonly auditEntries: readonly ExplainedAuditEntry[] };

export type GetFactHistoryInput = { readonly namespace: Namespace; readonly factId: FactId };

/** The upper bound of each `listFacts` read. A history is read whole, without paging. */
const HISTORY_READ_LIMIT = 1000;

type HistoryReadDeps = { readonly store: MemoryStore; readonly namespace: Namespace };

/**
 * Follows supersession links in both directions from a fact, and returns every fact reached.
 * The set of facts already reached ends the walk even if the data held a cycle.
 */
async function collectLinkedFacts(
  deps: HistoryReadDeps,
  start: FactWithSources,
): Promise<Result<Map<FactId, FactWithSources>>> {
  const reached = new Map<FactId, FactWithSources>();
  const waiting: FactWithSources[] = [start];
  for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
    if (reached.has(next.fact.id)) continue;
    reached.set(next.fact.id, next);

    const successorId = next.fact.supersededByFactId;
    if (successorId !== null && !reached.has(successorId)) {
      const successor = await deps.store.getFact({ namespace: deps.namespace, factId: successorId });
      if (!successor.ok) return successor;
      if (successor.value !== null) waiting.push(successor.value);
    }

    const superseded = await deps.store.listFacts({
      namespace: deps.namespace,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: next.fact.id,
      time: 'all',
      limit: HISTORY_READ_LIMIT,
    });
    if (!superseded.ok) return superseded;
    waiting.push(...superseded.value);
  }
  return ok(reached);
}

/** Every fact recorded for this subject and predicate, invalidated ones included: the timeline of a single value. */
async function listValueTimeline(
  deps: HistoryReadDeps,
  fact: FactWithSources,
): Promise<Result<readonly FactWithSources[]>> {
  return deps.store.listFacts({
    namespace: deps.namespace,
    subjectEntityId: fact.fact.subjectEntityId,
    predicate: fact.fact.predicate,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: HISTORY_READ_LIMIT,
  });
}

/**
 * Reads the audit entries of one fact, oldest first, each with the content of the source that
 * explains it. That source is read with `getSource` because it need not be linked to any fact:
 * the note that explains a retraction is not. `explanations` holds the sources already read.
 */
async function explainAuditEntries(
  deps: HistoryReadDeps,
  factId: FactId,
  explanations: Map<SourceId, string | null>,
): Promise<Result<readonly ExplainedAuditEntry[]>> {
  const listed = await deps.store.listAuditEntries({
    namespace: deps.namespace,
    targetKind: 'fact',
    targetId: factId,
  });
  if (!listed.ok) return listed;
  // MemoryStore does not promise an order, so the order of occurrence is set here.
  const entries = [...listed.value].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id);

  const explained: ExplainedAuditEntry[] = [];
  for (const entry of entries) {
    if (entry.sourceId === null) {
      explained.push({ ...entry, explanation: null });
      continue;
    }
    if (!explanations.has(entry.sourceId)) {
      const source = await deps.store.getSource({ namespace: deps.namespace, sourceId: entry.sourceId });
      if (!source.ok) return source;
      explanations.set(entry.sourceId, source.value?.content ?? null);
    }
    explained.push({ ...entry, explanation: explanations.get(entry.sourceId) ?? null });
  }
  return ok(explained);
}

/** Orders by the start of valid time, an unknown start first, then by recorded time, then by identifier. */
function compareHistoryEntries(a: FactWithSources, b: FactWithSources): number {
  const startA = a.fact.validFrom;
  const startB = b.fact.validFrom;
  if (startA !== startB) {
    if (startA === null) return -1;
    if (startB === null) return 1;
    return startA.localeCompare(startB);
  }
  return a.fact.createdAt.localeCompare(b.fact.createdAt) || a.fact.id.localeCompare(b.fact.id);
}

/**
 * Returns the history of a fact, live or not: the facts linked to it by supersession in both
 * directions and, for a single-valued predicate, every fact for the same subject and
 * predicate. Each comes with its sources and its audit entries, and each audit entry with the
 * explanation of the change. Ordered by valid time, then by recorded time. Writes nothing.
 */
export async function getFactHistory(
  deps: Pick<OperationDeps, 'store' | 'domain'>,
  input: GetFactHistoryInput,
): Promise<Result<{ readonly entries: readonly FactHistoryEntry[] }>> {
  const reads: HistoryReadDeps = { store: deps.store, namespace: input.namespace };
  const start = await deps.store.getFact({ namespace: input.namespace, factId: input.factId });
  if (!start.ok) return start;
  const startFact = start.value;
  if (startFact === null) return err('not_found', `No fact ${input.factId} in this namespace.`);

  const linked = await collectLinkedFacts(reads, startFact);
  if (!linked.ok) return linked;
  const facts = linked.value;

  const predicate = deps.domain.predicates.find((known) => known.name === startFact.fact.predicate);
  if (predicate?.cardinality === 'single') {
    const timeline = await listValueTimeline(reads, startFact);
    if (!timeline.ok) return timeline;
    for (const fact of timeline.value) if (!facts.has(fact.fact.id)) facts.set(fact.fact.id, fact);
  }

  const explanations = new Map<SourceId, string | null>();
  const entries: FactHistoryEntry[] = [];
  for (const fact of [...facts.values()].sort(compareHistoryEntries)) {
    const auditEntries = await explainAuditEntries(reads, fact.fact.id, explanations);
    if (!auditEntries.ok) return auditEntries;
    entries.push({ ...fact, auditEntries: auditEntries.value });
  }
  return ok({ entries });
}
