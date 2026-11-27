import {
  err,
  type FactId,
  type FactWithSources,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
} from '@kronomind/core';

export type RememberedFact = FactWithSources & {
  /** 'restated' when the fact was already live and only gained a source. */
  readonly outcome: 'recorded' | 'restated';
  /** The stored fact this one took the place of, and how, or null (FL-042). */
  readonly supersedes: { readonly factId: FactId; readonly kind: 'succession' | 'correction' } | null;
};

type Outcome = {
  readonly factId: FactId;
  readonly outcome: RememberedFact['outcome'];
  readonly supersedes?: RememberedFact['supersedes'];
};

/** Reads each recorded or restated fact after the commit, in the order given, each once. */
export async function readRememberedFacts(
  deps: Pick<OperationDeps, 'store'>,
  input: {
    readonly namespace: Namespace;
    readonly outcomes: readonly Outcome[];
  },
): Promise<Result<RememberedFact[]>> {
  const remembered: RememberedFact[] = [];
  for (const { factId, outcome, supersedes } of input.outcomes) {
    if (remembered.some((fact) => fact.fact.id === factId)) continue;
    const read = await deps.store.getFact({ namespace: input.namespace, factId });
    if (!read.ok) return read;
    if (read.value === null)
      return err('storage_failed', `The fact ${factId} was not found after the commit.`);
    remembered.push({ ...read.value, outcome, supersedes: supersedes ?? null });
  }
  return ok(remembered);
}
