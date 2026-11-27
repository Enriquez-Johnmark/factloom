import { createScriptedLlm, err, type LlmClient, parseDateInput, type Timestamp } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildExtractionInstructions, buildExtractionSchema, extractFacts } from './extract-facts.ts';
import { softwareDevelopmentDomain } from './software-development-domain.ts';

/** The reference time of every call: the moment the text is taken to be written. */
const NOW = at('2026-03-16T10:00:00.000Z');

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

type LlmRequest = Parameters<LlmClient['generateObject']>[0];

/** A scripted LLM that also keeps each request it was sent. */
function scripted(responses: readonly unknown[]): { llm: LlmClient; requests: LlmRequest[] } {
  const inner = createScriptedLlm(responses);
  const requests: LlmRequest[] = [];
  return {
    requests,
    llm: {
      generateObject(request) {
        requests.push(request);
        return inner.generateObject(request);
      },
    },
  };
}

function deps(llm: LlmClient) {
  return { llm, domain: softwareDevelopmentDomain, now: () => NOW };
}

/** A fact as the model returns it, with the fields a test does not care about filled in. */
function response(fact: {
  subject: { type: string; name: string };
  predicate: string;
  object: { type: string; name: string } | { value: string };
  valid_from?: string | null;
  valid_to?: string | null;
}) {
  return {
    statement: `${fact.subject.name} ${fact.predicate.replaceAll('_', ' ')}.`,
    confidence: 0.9,
    valid_from: null,
    valid_to: null,
    ...fact,
  };
}

const VITEST = response({
  subject: { type: 'repository', name: 'shop-api' },
  predicate: 'uses_test_framework',
  object: { type: 'dependency', name: 'Vitest' },
});

async function extractOne(fact: unknown) {
  const { llm } = scripted([{ facts: [fact] }]);
  const result = await extractFacts(deps(llm), 'Some text.');
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const JsonSchemaNodeSchema = z.looseObject({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
  additionalProperties: z.unknown().optional(),
  items: z.unknown().optional(),
  anyOf: z.array(z.unknown()).optional(),
  oneOf: z.array(z.unknown()).optional(),
});

/** Every object node of a JSON Schema, and every property that is union-typed or nullable. */
function walk(node: unknown, found = { objects: [] as z.infer<typeof JsonSchemaNodeSchema>[], unions: 0 }) {
  const parsed = JsonSchemaNodeSchema.safeParse(node);
  if (!parsed.success) return found;
  const schema = parsed.data;
  if (schema.properties !== undefined) {
    found.objects.push(schema);
    for (const property of Object.values(schema.properties)) {
      const child = JsonSchemaNodeSchema.safeParse(property);
      if (child.success && (child.data.anyOf ?? child.data.oneOf ?? null) !== null) found.unions += 1;
      if (child.success && Array.isArray(child.data.type)) found.unions += 1;
      walk(property, found);
    }
  }
  if (schema.items !== undefined) walk(schema.items, found);
  for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) walk(branch, found);
  return found;
}

describe('extractFacts', () => {
  it('the extraction schema stays inside the structured output limits', () => {
    const jsonSchema = z.toJSONSchema(buildExtractionSchema(softwareDevelopmentDomain));

    const { objects, unions } = walk(jsonSchema);

    // No recursion: a recursive schema needs a reference to itself.
    expect(JSON.stringify(jsonSchema)).not.toContain('$ref');
    expect(objects.length).toBeGreaterThan(0);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect([...(object.required ?? [])].sort()).toEqual(Object.keys(object.properties ?? {}).sort());
    }
    // At most 16 parameters using anyOf or type arrays: docs/research/technical/llm-anthropic.md, section 3.
    expect(unions).toBeLessThanOrEqual(16);
  });

  it('maps each extracted fact to a structured fact', async () => {
    const facts = await extractOne({
      ...VITEST,
      statement: 'shop-api runs its tests with Vitest.',
      confidence: 0.8,
    });

    expect(facts).toEqual([
      {
        subject: { type: 'repository', name: 'shop-api' },
        predicate: 'uses_test_framework',
        object: { kind: 'entity', type: 'dependency', name: 'Vitest' },
        statement: 'shop-api runs its tests with Vitest.',
        confidence: 0.8,
        validFrom: null,
        validTo: null,
      },
    ]);
  });

  it('maps an object that is a value', async () => {
    const [fact] = await extractOne(
      response({
        subject: { type: 'repository', name: 'shop-api' },
        predicate: 'deploys_to',
        object: { value: 'Fly.io' },
      }),
    );

    expect(fact?.object).toEqual({ kind: 'value', value: 'Fly.io' });
  });

  it('converts a calendar date to the start of that day in UTC', async () => {
    const [fact] = await extractOne({ ...VITEST, valid_from: '2026-02-03', valid_to: '2026-03-01' });

    expect(fact?.validFrom).toBe('2026-02-03T00:00:00.000Z');
    expect(fact?.validTo).toBe('2026-03-01T00:00:00.000Z');
  });

  it('leaves the start of valid time unknown when the response gives none', async () => {
    const [fact] = await extractOne(VITEST);

    expect(fact?.validFrom).toBeNull();
  });

  it('returns an empty list when the model finds nothing', async () => {
    const { llm } = scripted([{ facts: [] }]);

    const result = await extractFacts(deps(llm), 'Thanks, that worked.');

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('returns llm_failed when the client fails', async () => {
    const failing: LlmClient = { generateObject: () => Promise.resolve(err('llm_failed', 'Overloaded.')) };

    const result = await extractFacts(deps(failing), 'Some text.');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed for a predicate the domain does not have', async () => {
    const { llm } = scripted([{ facts: [{ ...VITEST, predicate: 'uses' }] }]);

    const result = await extractFacts(deps(llm), 'Some text.');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed for an entity type the domain does not have', async () => {
    const { llm } = scripted([{ facts: [{ ...VITEST, object: { type: 'library', name: 'Vitest' } }] }]);

    const result = await extractFacts(deps(llm), 'Some text.');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed for a date in another form', async () => {
    const { llm } = scripted([{ facts: [{ ...VITEST, valid_from: 'March 2026' }] }]);

    const result = await extractFacts(deps(llm), 'Some text.');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed for a confidence above 1', async () => {
    const { llm } = scripted([{ facts: [{ ...VITEST, confidence: 1.5 }] }]);

    const result = await extractFacts(deps(llm), 'Some text.');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('sends the reference time in the input and not in the instructions', async () => {
    const { llm, requests } = scripted([{ facts: [] }]);

    await extractFacts(deps(llm), 'Yesterday we switched docs-site to pnpm.');

    expect(requests[0]?.task).toBe('extraction');
    expect(requests[0]?.input).toContain(NOW);
    expect(requests[0]?.input).toContain('Yesterday we switched docs-site to pnpm.');
    expect(requests[0]?.instructions).not.toContain(NOW);
  });

  it('the instructions are the same bytes on every call', async () => {
    const { llm, requests } = scripted([{ facts: [] }, { facts: [] }]);

    await extractFacts(deps(llm), 'shop-api uses Vitest for its tests.');
    await extractFacts(deps(llm), 'The local Redis listens on port 6379.');

    expect(requests[0]?.instructions).toBe(requests[1]?.instructions);
    expect(requests[0]?.input).not.toBe(requests[1]?.input);
  });

  it('the instructions name every entity type and predicate of the domain', async () => {
    const { llm, requests } = scripted([{ facts: [] }]);

    await extractFacts(deps(llm), 'Some text.');

    for (const type of softwareDevelopmentDomain.entityTypes) {
      expect(requests[0]?.instructions).toContain(`- ${type}`);
    }
    for (const predicate of softwareDevelopmentDomain.predicates) {
      expect(requests[0]?.instructions).toContain(`- ${predicate.name} (`);
      expect(requests[0]?.instructions).toContain(predicate.description);
    }
  });
});

// Each response below is written from the expected facts of an FL-029 extraction case, in
// apps/mcp-server/evals/extraction-cases/, so the mapping is tested on the shapes they expect.
describe('extractFacts on the shapes of the extraction cases', () => {
  it('takes the date stated in the text as the start of valid time', async () => {
    // date-in-text.yaml: "Since 3 February 2026, shop-api has been deployed to Fly.io."
    const [fact] = await extractOne(
      response({
        subject: { type: 'repository', name: 'shop-api' },
        predicate: 'deploys_to',
        object: { value: 'Fly.io' },
        valid_from: '2026-02-03',
      }),
    );

    expect(fact?.validFrom).toBe(at('2026-02-03'));
    expect(fact?.validTo).toBeNull();
  });

  it('gives no start when the text has no date', async () => {
    // no-date.yaml: "The local Redis listens on port 6379."
    const [fact] = await extractOne(
      response({
        subject: { type: 'dependency', name: 'Redis' },
        predicate: 'listens_on_port',
        object: { value: '6379' },
      }),
    );

    expect(fact).toMatchObject({ predicate: 'listens_on_port', validFrom: null, validTo: null });
  });

  it('returns no fact for a plan', async () => {
    // plan.yaml: "We plan to move shop-api to Kubernetes in June." Nothing is expected.
    const { llm } = scripted([{ facts: [] }]);

    const result = await extractFacts(deps(llm), 'We plan to move shop-api to Kubernetes in June.');

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('passes on a date the model resolved from a relative date', async () => {
    // relative-date.yaml, written on 2026-03-16: "Yesterday we switched docs-site from npm to pnpm."
    const docsSite = { type: 'repository', name: 'docs-site' };
    const { llm } = scripted([
      {
        facts: [
          response({
            subject: docsSite,
            predicate: 'uses_package_manager',
            object: { type: 'dependency', name: 'pnpm' },
            valid_from: '2026-03-15',
          }),
          response({
            subject: docsSite,
            predicate: 'uses_package_manager',
            object: { type: 'dependency', name: 'npm' },
            valid_to: '2026-03-15',
          }),
        ],
      },
    ]);

    const result = await extractFacts(deps(llm), 'Yesterday we switched docs-site from npm to pnpm.');

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.map((fact) => [fact.object, fact.validFrom, fact.validTo])).toEqual([
      [{ kind: 'entity', type: 'dependency', name: 'pnpm' }, at('2026-03-15'), null],
      [{ kind: 'entity', type: 'dependency', name: 'npm' }, null, at('2026-03-15')],
    ]);
  });
});

describe('the extraction instructions', () => {
  it('name the configured repository as the subject of "we" when one is given', () => {
    const instructions = buildExtractionInstructions(softwareDevelopmentDomain, 'shop-api');

    expect(instructions).toContain('This memory is about the repository shop-api.');
    expect(instructions).toContain('"we", "our", "us" or "this repository"');
  });

  it('are unchanged when no repository is given', () => {
    const without = buildExtractionInstructions(softwareDevelopmentDomain);

    expect(without).not.toContain('This memory is about the repository');
    expect(buildExtractionInstructions(softwareDevelopmentDomain, 'shop-api').replace(without, '')).not.toBe(
      '',
    );
  });
});
