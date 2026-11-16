import {
  type ConflictJudgeInput,
  createScriptedLlm,
  type FactObject,
  type FactWithSources,
  type LlmClient,
  type Timestamp,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { judgeConflicts } from './judge-conflicts.ts';

const NAMESPACE = 'shop-api';
const SHOP_API = {
  id: 'entity-shop-api',
  namespace: NAMESPACE,
  type: 'repository',
  name: 'shop-api',
} as const;
const RECORDED_ON = day('2026-01-10');
const OBSERVED_ON = day('2026-04-02');
const SWITCHED_ON = day('2026-03-26');

function day(date: string): Timestamp {
  return toTimestamp(new Date(`${date}T00:00:00.000Z`));
}

/** An LLM client that fails the test if it is called. */
const NO_LLM: LlmClient = createScriptedLlm([]);

/** A stored entity, as a read returns it. */
function storedEntity(name: string) {
  return { id: `entity-${name}`, namespace: NAMESPACE, type: 'dependency', name, createdAt: RECORDED_ON };
}

/** A live stored fact about shop-api's test framework, with an entity or a value as its object. */
function storedFact(
  id: string,
  object: { readonly entity: string } | { readonly value: string },
  validFrom: Timestamp | null = null,
  validTo: Timestamp | null = null,
): FactWithSources {
  const isEntity = 'entity' in object;
  const factObject: FactObject = isEntity
    ? { kind: 'entity', entityId: `entity-${object.entity}` }
    : { kind: 'value', value: object.value };
  return {
    fact: {
      id,
      namespace: NAMESPACE,
      subjectEntityId: SHOP_API.id,
      predicate: 'uses_test_framework',
      object: factObject,
      statement: `shop-api uses ${isEntity ? object.entity : object.value} for its tests.`,
      confidence: 0.9,
      validFrom,
      validTo,
      createdAt: RECORDED_ON,
      invalidatedAt: null,
      supersededByFactId: null,
    },
    subject: { ...SHOP_API, createdAt: RECORDED_ON },
    objectEntity: isEntity ? storedEntity(object.entity) : null,
    sources: [],
  };
}

/** The new fact "shop-api uses Vitest", judged against the given candidates. */
function judgeInput(
  candidates: readonly FactWithSources[],
  options: { readonly cardinality?: 'single' | 'multi'; readonly validFrom?: Timestamp | null } = {},
): ConflictJudgeInput {
  return {
    fact: {
      subjectEntityId: SHOP_API.id,
      predicate: 'uses_test_framework',
      object: { kind: 'entity', entityId: 'entity-Vitest' },
      statement: 'shop-api uses Vitest for its unit tests.',
      confidence: 0.9,
      validFrom: options.validFrom === undefined ? SWITCHED_ON : options.validFrom,
      validTo: null,
    },
    objectEntityName: 'Vitest',
    sourceText: 'We switched the unit tests of shop-api from Jest to Vitest on 26 March 2026.',
    observedAt: OBSERVED_ON,
    cardinality: options.cardinality ?? 'single',
    candidates,
  };
}

describe('judgeConflicts', () => {
  it('gives no verdicts, and asks no LLM, when there are no candidates', async () => {
    const result = await judgeConflicts({ llm: NO_LLM }, judgeInput([]));

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('judges a candidate with the same object a duplicate without asking the LLM', async () => {
    const result = await judgeConflicts(
      { llm: NO_LLM },
      judgeInput([storedFact('fact-1', { entity: 'Vitest' })]),
    );

    expect(result).toEqual({ ok: true, value: [{ kind: 'duplicate' }] });
  });

  it('judges a value that differs only in case and spacing a duplicate without asking the LLM', async () => {
    const input = judgeInput([storedFact('fact-1', { value: '  PNPM ' })]);
    const result = await judgeConflicts(
      { llm: NO_LLM },
      { ...input, fact: { ...input.fact, object: { kind: 'value', value: 'pnpm' } } },
    );

    expect(result).toEqual({ ok: true, value: [{ kind: 'duplicate' }] });
  });

  it('judges another object of a multi-valued predicate unrelated without asking the LLM', async () => {
    const result = await judgeConflicts(
      { llm: NO_LLM },
      judgeInput([storedFact('fact-1', { entity: 'Jest' })], { cardinality: 'multi' }),
    );

    expect(result).toEqual({ ok: true, value: [{ kind: 'unrelated' }] });
  });

  it('judges a candidate whose valid period ends before the new fact starts unrelated without asking the LLM', async () => {
    const ended = storedFact('fact-1', { entity: 'Jest' }, day('2025-01-01'), day('2026-03-26'));

    const result = await judgeConflicts({ llm: NO_LLM }, judgeInput([ended]));

    expect(result).toEqual({ ok: true, value: [{ kind: 'unrelated' }] });
  });

  it('dates a succession at the new fact’s valid-from when the fact has one', async () => {
    const llm = createScriptedLlm([{ verdicts: [{ stored_fact: 1, verdict: 'succession' }] }]);

    const result = await judgeConflicts({ llm }, judgeInput([storedFact('fact-1', { entity: 'Jest' })]));

    expect(result).toEqual({ ok: true, value: [{ kind: 'succession', changedAt: SWITCHED_ON }] });
  });

  it('dates a succession at the time the source was observed when the new fact has no valid-from', async () => {
    const llm = createScriptedLlm([{ verdicts: [{ stored_fact: 1, verdict: 'succession' }] }]);

    const result = await judgeConflicts(
      { llm },
      judgeInput([storedFact('fact-1', { entity: 'Jest' })], { validFrom: null }),
    );

    expect(result).toEqual({ ok: true, value: [{ kind: 'succession', changedAt: OBSERVED_ON }] });
  });

  it('asks about all remaining candidates of one new fact in one LLM call', async () => {
    // The scripted LLM throws on a second call, so three verdicts prove one call.
    const llm = createScriptedLlm([
      {
        verdicts: [
          { stored_fact: 3, verdict: 'correction' },
          { stored_fact: 1, verdict: 'unrelated' },
          { stored_fact: 2, verdict: 'duplicate' },
        ],
      },
    ]);
    const candidates = [
      storedFact('fact-1', { entity: 'Jest' }),
      storedFact('fact-2', { entity: 'Vitest runner' }),
      storedFact('fact-3', { entity: 'Mocha' }),
    ];

    const result = await judgeConflicts({ llm }, judgeInput(candidates));

    expect(result).toEqual({
      ok: true,
      value: [{ kind: 'unrelated' }, { kind: 'duplicate' }, { kind: 'correction' }],
    });
  });

  it('returns verdicts by rule and by the LLM in the order of the candidates', async () => {
    const llm = createScriptedLlm([{ verdicts: [{ stored_fact: 1, verdict: 'correction' }] }]);
    const candidates = [
      storedFact('fact-1', { entity: 'Vitest' }),
      storedFact('fact-2', { entity: 'Jest' }),
      storedFact('fact-3', { entity: 'Mocha' }, day('2024-01-01'), day('2025-01-01')),
    ];

    const result = await judgeConflicts({ llm }, judgeInput(candidates));

    expect(result).toEqual({
      ok: true,
      value: [{ kind: 'duplicate' }, { kind: 'correction' }, { kind: 'unrelated' }],
    });
  });

  it('fails with llm_failed when the answer names a stored fact out of range', async () => {
    const llm = createScriptedLlm([
      {
        verdicts: [
          { stored_fact: 1, verdict: 'unrelated' },
          { stored_fact: 2, verdict: 'correction' },
        ],
      },
    ]);

    const result = await judgeConflicts({ llm }, judgeInput([storedFact('fact-1', { entity: 'Jest' })]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('fails with llm_failed when the answer leaves a candidate out', async () => {
    const llm = createScriptedLlm([{ verdicts: [{ stored_fact: 2, verdict: 'succession' }] }]);
    const candidates = [storedFact('fact-1', { entity: 'Jest' }), storedFact('fact-2', { entity: 'Mocha' })];

    const result = await judgeConflicts({ llm }, judgeInput(candidates));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('fails with llm_failed when the answer names a candidate twice', async () => {
    const llm = createScriptedLlm([
      {
        verdicts: [
          { stored_fact: 1, verdict: 'unrelated' },
          { stored_fact: 2, verdict: 'correction' },
          { stored_fact: 1, verdict: 'correction' },
        ],
      },
    ]);
    const candidates = [storedFact('fact-1', { entity: 'Jest' }), storedFact('fact-2', { entity: 'Mocha' })];

    const result = await judgeConflicts({ llm }, judgeInput(candidates));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('fails with llm_failed when the answer does not match the schema', async () => {
    const llm = createScriptedLlm([{ verdicts: [{ stored_fact: 1, verdict: 'refinement' }] }]);

    const result = await judgeConflicts({ llm }, judgeInput([storedFact('fact-1', { entity: 'Jest' })]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('asks under the conflict_detection task, with the facts in the input and none in the instructions', async () => {
    const requests: { task: string; instructions: string; input: string }[] = [];
    const llm: LlmClient = {
      generateObject(request) {
        requests.push({ task: request.task, instructions: request.instructions, input: request.input });
        return createScriptedLlm([{ verdicts: [{ stored_fact: 1, verdict: 'succession' }] }]).generateObject(
          request,
        );
      },
    };

    await judgeConflicts({ llm }, judgeInput([storedFact('fact-1', { entity: 'Jest' })]));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.task).toBe('conflict_detection');
    expect(requests[0]?.input).toContain('1. Statement: shop-api uses Jest for its tests.');
    expect(requests[0]?.input).toContain('We switched the unit tests of shop-api from Jest to Vitest');
    expect(requests[0]?.instructions).not.toContain('Jest');
  });
});
