import type { Namespace, Source } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import type { Timestamp } from '../timestamp.ts';
import { hashContent } from './hash-content.ts';
import type { NewSource } from './operation-inputs.ts';

/** Turns a new source into the row to record: with an identifier, a namespace and a content hash. */
export async function buildSource(
  deps: Pick<OperationDeps, 'newId'>,
  parts: { readonly namespace: Namespace; readonly source: NewSource; readonly createdAt: Timestamp },
): Promise<Source> {
  return {
    ...parts.source,
    id: deps.newId(),
    namespace: parts.namespace,
    contentHash: parts.source.content === null ? null : await hashContent(parts.source.content),
    createdAt: parts.createdAt,
  };
}
