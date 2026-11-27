import type { Timestamp } from '@kronomind/core';

/** A fact given by name, before its entities are resolved. */
export type StructuredFactInput = {
  readonly subject: { readonly type: string; readonly name: string };
  readonly predicate: string;
  readonly object:
    | { readonly kind: 'entity'; readonly type: string; readonly name: string }
    | { readonly kind: 'value'; readonly value: string };
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
};
