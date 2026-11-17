import { type FactWithSources, parseDateInput, type Timestamp } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { toFactOutput } from './to-fact-output.ts';

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const SHOP = {
  id: 'e-shop',
  namespace: 'repo:shop-api',
  type: 'repository',
  name: 'shop-api',
  createdAt: at('2026-01-10'),
};
const REDIS = {
  id: 'e-redis',
  namespace: 'repo:shop-api',
  type: 'dependency',
  name: 'redis',
  createdAt: at('2026-01-10'),
};
const SOURCE = {
  id: 's-1',
  namespace: 'repo:shop-api',
  kind: 'file',
  locator: 'package.json',
  version: 'abc123',
  content: 'A long text that the tool does not return.',
  contentHash: null,
  purgedAt: null,
  observedAt: at('2026-01-09'),
  createdAt: at('2026-01-10'),
};

function factWith(object: FactWithSources['fact']['object'], objectEntity: FactWithSources['objectEntity']) {
  const found: FactWithSources = {
    fact: {
      id: 'f-1',
      namespace: 'repo:shop-api',
      subjectEntityId: SHOP.id,
      predicate: 'depends_on',
      object,
      statement: 'The shop API depends on redis.',
      confidence: 0.9,
      validFrom: at('2025-01-01'),
      validTo: null,
      createdAt: at('2026-01-10'),
      invalidatedAt: at('2026-02-01'),
      purgedAt: null,
      supersededByFactId: 'f-2',
    },
    subject: SHOP,
    objectEntity,
    sources: [SOURCE],
    archivedAt: null,
  };
  return found;
}

describe('toFactOutput', () => {
  it('translates a fact with an entity as its object', () => {
    const output = toFactOutput(factWith({ kind: 'entity', entityId: REDIS.id }, REDIS));

    expect(output).toEqual({
      fact_id: 'f-1',
      statement: 'The shop API depends on redis.',
      subject: { type: 'repository', name: 'shop-api' },
      predicate: 'depends_on',
      object: { type: 'dependency', name: 'redis' },
      confidence: 0.9,
      valid_from: at('2025-01-01'),
      valid_to: null,
      recorded_at: at('2026-01-10'),
      invalidated_at: at('2026-02-01'),
      superseded_by_fact_id: 'f-2',
      sources: [{ kind: 'file', locator: 'package.json', version: 'abc123', observed_at: at('2026-01-09') }],
    });
  });

  it('translates a fact with a value as its object', () => {
    const output = toFactOutput(factWith({ kind: 'value', value: 'redis 7.2' }, null));

    expect(output.object).toEqual({ value: 'redis 7.2' });
  });
});
