import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { describe, expect, it } from 'vitest';
import { EXTRACTION_CASE_KINDS, type ExtractionCase, parseExtractionCase } from './extraction-case.ts';

const directory = join(import.meta.dirname, 'extraction-cases');
const fileNames = readdirSync(directory)
  .filter((name) => name.endsWith('.yaml'))
  .sort();

function load(fileName: string): ExtractionCase {
  const parsed = parseExtractionCase(
    readFileSync(join(directory, fileName), 'utf8'),
    softwareDevelopmentDomain,
  );
  if (!parsed.ok) throw new Error(`${fileName}: ${parsed.error.message}`);
  return parsed.value;
}

function codeOf(yamlText: string): string | null {
  const parsed = parseExtractionCase(yamlText, softwareDevelopmentDomain);
  return parsed.ok ? null : parsed.error.code;
}

const FACT = `
  - subject: { type: repository, name: shop-api }
    predicate: uses_test_framework
    object: { type: dependency, name: Vitest }
    valid_from: null
    valid_to: null`;

const VALID = `
name: "One plain fact: an example"
kinds: [one-plain-fact]
observed_at: 2026-03-02
text: shop-api uses Vitest for its tests.
expected:${FACT}
    required: true
`;

describe('the extraction case files', () => {
  it('every extraction case matches the case schema and the domain', () => {
    for (const fileName of fileNames) expect(() => load(fileName)).not.toThrow();
    console.info(`Extraction case files: ${fileNames.length}`);
    expect(fileNames.length).toBeGreaterThanOrEqual(18);
  });

  it('every listed kind of case is present', () => {
    const cases = fileNames.map(load);
    const counts = EXTRACTION_CASE_KINDS.map(
      (kind) => [kind, cases.filter((extractionCase) => extractionCase.kinds.includes(kind)).length] as const,
    );
    console.info(
      `Extraction cases per kind:\n${counts.map(([kind, count]) => `  ${kind}: ${count}`).join('\n')}`,
    );
    for (const [kind, count] of counts) expect(count, kind).toBeGreaterThan(0);
  });

  it('every case with an expected fact marks one as required', () => {
    for (const fileName of fileNames) {
      const { expected } = load(fileName);
      if (expected.length > 0)
        expect(
          expected.some((fact) => fact.required),
          fileName,
        ).toBe(true);
    }
  });

  it('gives each case a name of its own', () => {
    const names = fileNames.map((fileName) => load(fileName).name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('parseExtractionCase', () => {
  it('accepts a valid case', () => {
    expect(codeOf(VALID)).toBeNull();
  });

  it('rejects an expected fact with no required field', () => {
    expect(codeOf(VALID.replace('    required: true\n', ''))).toBe('invalid_input');
  });

  it('rejects a case whose expected facts are none of them required', () => {
    expect(codeOf(VALID.replace('required: true', 'required: false'))).toBe('invalid_input');
  });

  it('rejects a predicate that is not in the domain', () => {
    expect(codeOf(VALID.replace('predicate: uses_test_framework', 'predicate: uses'))).toBe('invalid_input');
  });

  it('rejects an entity type that is not in the domain', () => {
    expect(codeOf(VALID.replace('type: dependency', 'type: library'))).toBe('invalid_input');
  });

  it('rejects a field the schema does not name', () => {
    expect(codeOf(`${VALID}notes: anything\n`)).toBe('invalid_input');
  });

  it('rejects a kind that is not listed', () => {
    expect(codeOf(VALID.replace('[one-plain-fact]', '[a-new-kind]'))).toBe('invalid_input');
  });

  it('rejects a date it cannot read', () => {
    expect(codeOf(VALID.replace('valid_from: null', 'valid_from: last week'))).toBe('invalid_input');
  });

  it('rejects text that is not YAML', () => {
    expect(codeOf('name: [unclosed')).toBe('invalid_input');
  });
});
