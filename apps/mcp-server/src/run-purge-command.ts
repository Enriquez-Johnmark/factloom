import {
  type FactWithSources,
  type MemoryStore,
  type Namespace,
  type OperationDeps,
  ok,
  purgeContent,
  type Result,
  type Source,
} from '@factloom/core';
import { clearFreedPages } from '@factloom/storage';
import type { Command } from './read-command.ts';

export type PurgeCommandDeps = Pick<OperationDeps, 'store' | 'now' | 'newId'> & {
  readonly namespace: Namespace;
  /** The database file, for clearing freed pages after a purge. */
  readonly databasePath: string;
  /** Writes one line for the person running the command. */
  readonly write: (line: string) => void;
};

const UNLIMITED = 10_000;

/** The fact and every fact linked to it by supersession, in either direction. */
async function readLinkedFacts(
  store: MemoryStore,
  namespace: Namespace,
  factId: string,
): Promise<Result<readonly FactWithSources[] | null>> {
  const first = await store.getFact({ namespace, factId });
  if (!first.ok) return first;
  if (first.value === null) return ok(null);
  const facts = new Map([[first.value.fact.id, first.value]]);
  const queue = [first.value];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const earlier = await store.listFacts({
      namespace,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: next.fact.id,
      time: 'all',
      limit: UNLIMITED,
    });
    if (!earlier.ok) return earlier;
    const later =
      next.fact.supersededByFactId === null
        ? null
        : await store.getFact({ namespace, factId: next.fact.supersededByFactId });
    if (later !== null && !later.ok) return later;
    for (const linked of [...earlier.value, ...(later?.value ? [later.value] : [])]) {
      if (!facts.has(linked.fact.id)) {
        facts.set(linked.fact.id, linked);
        queue.push(linked);
      }
    }
  }
  return ok([...facts.values()]);
}

/** One line per source, with no content: identifier, kind, locator and observed time. */
function describeSource(source: Source): string {
  return [source.id, source.kind, source.locator ?? '-', source.observedAt].join('\t');
}

/**
 * Runs a purge command and returns the exit code. It prints identifiers, kinds, locators and
 * times, and never content. After a purge it closes the store and clears freed pages, and
 * says whether the write-ahead log could be truncated.
 */
export async function runPurgeCommand(
  deps: PurgeCommandDeps,
  command: Exclude<Command, { readonly kind: 'serve' }>,
): Promise<number> {
  if (command.kind === 'invalid') {
    deps.write(`invalid_input: ${command.message}`);
    return 2;
  }
  if (command.kind === 'list_sources') {
    const linked = await readLinkedFacts(deps.store, deps.namespace, command.factId);
    if (!linked.ok) {
      deps.write(`${linked.error.code}: ${linked.error.message}`);
      return 1;
    }
    if (linked.value === null) {
      deps.write(`not_found: No fact ${command.factId} in this namespace.`);
      return 1;
    }
    const sources = new Map(
      linked.value.flatMap(({ sources }) => sources.map((source) => [source.id, source] as const)),
    );
    for (const source of sources.values()) deps.write(describeSource(source));
    return 0;
  }
  const purged = await purgeContent(deps, {
    namespace: deps.namespace,
    trigger: 'person',
    reasonCode: command.reason,
    sourceId: command.sourceId,
  });
  if (!purged.ok) {
    deps.write(`${purged.error.code}: ${purged.error.message}`);
    return 1;
  }
  deps.write(`Purged sources: ${purged.value.purgedSourceIds.join(', ')}`);
  deps.write(`Purged facts: ${purged.value.purgedFactIds.join(', ') || 'none'}`);
  await deps.store.close();
  const cleared = clearFreedPages(deps.databasePath);
  if (!cleared.ok) {
    deps.write(`${cleared.error.code}: ${cleared.error.message}`);
    return 1;
  }
  deps.write(
    cleared.value.checkpointComplete
      ? 'Freed pages cleared.'
      : 'Freed pages cleared in the file, but another connection is reading, so the write-ahead log still holds old pages. Run the purge again when the server is stopped.',
  );
  return 0;
}
