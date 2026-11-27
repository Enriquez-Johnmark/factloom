import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { findNamesOutsideDomain, parseScenario, type Scenario } from './scenario.ts';

const directory = join(import.meta.dirname, 'scenarios');
const fileNames = readdirSync(directory)
  .filter((name) => name.endsWith('.yaml'))
  .sort();

/** The eleven cases of the "Layer B" table in docs/architecture/TESTING.md. */
const CASES = [
  'Succession',
  'Correction',
  'Restatement',
  'Multi-valued predicate',
  'Unrelated fact about the same subject',
  'Older fact arriving late',
  'A known name mentioned under a different entity type',
  'A date in the text',
  'No date in the text',
  'A plan',
  'Retraction',
] as const;

/** The cases whose row speaks of an earlier date, so the file must ask about the past. */
const CASES_ABOUT_THE_PAST = [
  'Succession',
  'Correction',
  'Older fact arriving late',
  'A date in the text',
  'No date in the text',
  'Retraction',
];

function load(fileName: string): Scenario {
  const parsed = parseScenario(readFileSync(join(directory, fileName), 'utf8'));
  if (!parsed.ok) throw new Error(`${fileName}: ${parsed.error.message}`);
  return parsed.value;
}

const VALID = `
name: "Succession: an example"
steps:
  - at: 2026-01-10
    remember: We use Jest.
  - at: 2026-04-02
    remember: We switched to Vitest.
expect:
  - ask: { subject: { name: shop-api, type: repository }, predicate: uses_test_framework }
    returns: [Vitest]
`;

function codeOf(yamlText: string): string | null {
  const parsed = parseScenario(yamlText);
  return parsed.ok ? null : parsed.error.code;
}

describe('the scenario files', () => {
  it('every scenario file matches the scenario schema', () => {
    expect(fileNames).toHaveLength(11);
    for (const fileName of fileNames) expect(() => load(fileName)).not.toThrow();
  });

  it('covers every case in the table', () => {
    const names = fileNames.map((fileName) => load(fileName).name);
    for (const covered of CASES) {
      expect(
        names.filter((name) => name.startsWith(`${covered}:`)),
        covered,
      ).toHaveLength(1);
    }
  });

  it('every ask about the past states a date', () => {
    for (const fileName of fileNames) {
      const scenario = load(fileName);
      if (!CASES_ABOUT_THE_PAST.some((covered) => scenario.name.startsWith(`${covered}:`))) continue;
      const datedAsks = scenario.expect.filter(
        (entry) => 'ask' in entry && (entry.ask.as_of !== undefined || entry.ask.known_at !== undefined),
      );
      expect(datedAsks.length, fileName).toBeGreaterThan(0);
    }
  });

  it('every scenario uses only entity types and predicates of the software development domain', () => {
    for (const fileName of fileNames) {
      expect(findNamesOutsideDomain(load(fileName), softwareDevelopmentDomain), fileName).toEqual([]);
    }
  });

  it('reads a calendar date and a full timestamp as text, not as a date object', () => {
    const scenario = load('succession.yaml');
    expect(scenario.steps[0]?.at).toBe('2026-01-10');
    const withTimestamp = parseScenario(VALID.replace('at: 2026-01-10', 'at: 2026-01-10T08:30:00.000Z'));
    expect(withTimestamp.ok && withTimestamp.value.steps[0]?.at).toBe('2026-01-10T08:30:00.000Z');
  });
});

describe('parseScenario', () => {
  it('accepts a valid scenario', () => {
    expect(codeOf(VALID)).toBeNull();
  });

  it('rejects a scenario with an unknown key', () => {
    expect(codeOf(`${VALID}notes: extra\n`)).toBe('invalid_input');
    expect(codeOf(VALID.replace('returns: [Vitest]', 'returns: [Vitest]\n    comment: extra'))).toBe(
      'invalid_input',
    );
  });

  it('rejects a step with no input', () => {
    expect(codeOf(VALID.replace('    remember: We use Jest.\n', ''))).toBe('invalid_input');
  });

  it('rejects a step with both kinds of input', () => {
    const both = VALID.replace(
      '    remember: We use Jest.\n',
      '    remember: We use Jest.\n    change_fact: { subject: { name: shop-api }, predicate: uses_test_framework, value: Jest, because: was_wrong, explanation: A typo. }\n',
    );
    expect(codeOf(both)).toBe('invalid_input');
  });

  it('rejects an ask with no expected values', () => {
    expect(codeOf(VALID.replace('    returns: [Vitest]\n', ''))).toBe('invalid_input');
  });

  it('rejects an entities entry with no count', () => {
    expect(codeOf(`${VALID}  - entities: { name: shop-api }\n`)).toBe('invalid_input');
    expect(codeOf(`${VALID}  - entities: { name: shop-api }\n    count: 1\n`)).toBeNull();
  });

  it('rejects steps that are out of order', () => {
    expect(codeOf(VALID.replace('at: 2026-04-02', 'at: 2026-01-09'))).toBe('invalid_input');
  });

  it('rejects an empty list of steps, and a date in another form', () => {
    expect(codeOf('name: x\nsteps: []\nexpect:\n  - entities: { name: a }\n    count: 0\n')).toBe(
      'invalid_input',
    );
    expect(codeOf(VALID.replace('at: 2026-01-10', 'at: 10 January 2026'))).toBe('invalid_input');
  });

  it('rejects text that is not YAML', () => {
    expect(codeOf('name: [unclosed')).toBe('invalid_input');
  });

  it('rejects a scenario that names a predicate the domain does not have', () => {
    const parsed = parseScenario(VALID.replace('predicate: uses_test_framework', 'predicate: uses_linter'));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(findNamesOutsideDomain(parsed.value, softwareDevelopmentDomain)).toEqual([
        'expect 1: the predicate "uses_linter" is not in the domain',
      ]);
    }
    const wrongType = parseScenario(VALID.replace('type: repository', 'type: service'));
    expect(wrongType.ok && findNamesOutsideDomain(wrongType.value, softwareDevelopmentDomain)).toEqual([
      'expect 1: the entity type "service" is not in the domain',
    ]);
  });
});
