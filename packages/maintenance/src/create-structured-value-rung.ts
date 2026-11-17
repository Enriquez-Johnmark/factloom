import { type FactWithSources, ok, type Result } from '@factloom/core';
import type { RepositoryReader } from './repository-reader.ts';
import type { RungDecision, VerificationRung } from './verify-anchored-facts.ts';

/** What a structured check read in a file: a value, no value, or a file it cannot read. */
export type CheckedValue =
  | { readonly kind: 'value'; readonly value: string | null }
  | { readonly kind: 'unreadable' };

/**
 * A check a domain supplies for one predicate: how to read the fact's value from the text of
 * its anchored file, and the statement of a successor that holds a new value.
 */
export type StructuredCheck = {
  readonly readValue: (found: FactWithSources, text: string) => CheckedValue;
  readonly describeSuccessor: (found: FactWithSources, value: string) => string;
};

/** The value at a commit, or null when the file or the value cannot be read there. */
async function readAt(
  repository: RepositoryReader,
  check: StructuredCheck,
  found: FactWithSources,
  at: { readonly commit: string; readonly path: string },
): Promise<Result<CheckedValue>> {
  const text = await repository.readText(at.commit, at.path);
  if (!text.ok) return text;
  return ok(text.value === null ? { kind: 'unreadable' } : check.readValue(found, text.value));
}

/**
 * The rung for a file that changed, when the domain can read the fact's value from it: the
 * value at the anchor's commit against the value at HEAD. The same value is `confirmed`; a
 * different one, or none at HEAD, `contradicted`. For a new value it names the successor and
 * when the value changed: the committer time of the first commit after the anchor whose
 * value differs. A predicate with no check, or a file that cannot be read, decides nothing.
 */
export function createStructuredValueRung(
  checks: Readonly<Record<string, StructuredCheck>>,
): VerificationRung {
  return {
    name: 'structured_value',
    placement: 'after_content_changed',
    async check({ found, anchor, head, repository }): Promise<Result<RungDecision | null>> {
      const check = checks[found.fact.predicate];
      if (check === undefined) return ok(null);
      const [then, now] = await Promise.all([
        readAt(repository, check, found, anchor),
        readAt(repository, check, found, { commit: head, path: anchor.path }),
      ]);
      if (!then.ok) return then;
      if (!now.ok) return now;
      if (then.value.kind !== 'value' || now.value.kind !== 'value') return ok(null);
      const before = then.value.value;
      const after = now.value.value;
      if (before === after) return ok({ outcome: 'confirmed', successor: null });
      if (after === null) return ok({ outcome: 'contradicted', successor: null });
      const commits = await repository.listCommitsTouching(anchor.path, anchor.commit);
      if (!commits.ok) return commits;
      for (const { commit, committedAt } of commits.value) {
        const value = await readAt(repository, check, found, { commit, path: anchor.path });
        if (!value.ok) return value;
        if (value.value.kind === 'value' && value.value.value !== before) {
          const statement = check.describeSuccessor(found, after);
          return ok({
            outcome: 'contradicted',
            successor: { value: after, statement, changedAt: committedAt },
          });
        }
      }
      // HEAD differs, so some commit must; without one the change cannot be dated.
      return ok({ outcome: 'contradicted', successor: null });
    },
  };
}
