import type { ReasonCode, Trigger } from '../audit.ts';
import type { EntityId, FactObject, Namespace } from '../fact.ts';
import type { Timestamp } from '../timestamp.ts';

/** Who is making the change and why. Copied into every audit entry. */
export type ChangeContext = {
  readonly namespace: Namespace;
  readonly trigger: Trigger;
  readonly reasonCode: ReasonCode;
};

/** A source not yet recorded. The operation gives it an identifier and a hash. */
export type NewSource = {
  readonly kind: string;
  readonly locator: string | null;
  readonly version: string | null;
  readonly content: string | null;
  readonly observedAt: Timestamp;
};

export type NewEntity = { readonly id: EntityId; readonly type: string; readonly name: string };

export type NewFact = {
  /** An existing entity, or one of the new entities given with it. */
  readonly subjectEntityId: EntityId;
  readonly predicate: string;
  readonly object: FactObject;
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
};

/** A fact with the entities it introduces. */
export type FactDraft = { readonly fact: NewFact; readonly newEntities: readonly NewEntity[] };
