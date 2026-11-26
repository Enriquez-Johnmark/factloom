import { DomainSchema } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { softwareDevelopmentDomain } from './software-development-domain.ts';

/** The timeline scenario cases of docs/architecture/TESTING.md, as the facts each one needs. */
const SCENARIO_CASES: readonly {
  readonly scenario: string;
  readonly subjectType: string;
  readonly predicate: string;
  readonly objectEntityType: string | null;
  readonly cardinality: 'single' | 'multi';
}[] = [
  {
    scenario: 'Succession',
    subjectType: 'repository',
    predicate: 'uses_test_framework',
    objectEntityType: 'dependency',
    cardinality: 'single',
  },
  {
    scenario: 'Correction',
    subjectType: 'dependency',
    predicate: 'listens_on_port',
    objectEntityType: null,
    cardinality: 'single',
  },
  {
    scenario: 'Restatement',
    subjectType: 'repository',
    predicate: 'uses_package_manager',
    objectEntityType: 'dependency',
    cardinality: 'single',
  },
  {
    scenario: 'Multi-valued predicate',
    subjectType: 'repository',
    predicate: 'follows_convention',
    objectEntityType: 'convention',
    cardinality: 'multi',
  },
  {
    scenario: 'Unrelated fact about the same subject',
    subjectType: 'repository',
    predicate: 'uses_test_framework',
    objectEntityType: 'dependency',
    cardinality: 'single',
  },
  {
    scenario: 'Unrelated fact about the same subject',
    subjectType: 'repository',
    predicate: 'uses_package_manager',
    objectEntityType: 'dependency',
    cardinality: 'single',
  },
  {
    scenario: 'Older fact arriving late',
    subjectType: 'repository',
    predicate: 'deploys_to',
    objectEntityType: null,
    cardinality: 'single',
  },
  {
    scenario: 'A known name under a different entity type',
    subjectType: 'repository',
    predicate: 'follows_convention',
    objectEntityType: 'convention',
    cardinality: 'multi',
  },
  {
    scenario: 'A known name under a different entity type',
    subjectType: 'decision',
    predicate: 'has_status',
    objectEntityType: null,
    cardinality: 'single',
  },
  {
    scenario: 'A date in the text',
    subjectType: 'repository',
    predicate: 'uses_package_manager',
    objectEntityType: 'dependency',
    cardinality: 'single',
  },
  {
    scenario: 'No date in the text',
    subjectType: 'repository',
    predicate: 'uses_test_framework',
    objectEntityType: 'dependency',
    cardinality: 'single',
  },
  {
    scenario: 'A plan',
    subjectType: 'repository',
    predicate: 'deploys_to',
    objectEntityType: null,
    cardinality: 'single',
  },
  {
    scenario: 'Retraction',
    subjectType: 'repository',
    predicate: 'follows_convention',
    objectEntityType: 'convention',
    cardinality: 'multi',
  },
];

const SNAKE_CASE = /^[a-z]+(_[a-z]+)*$/;

describe('softwareDevelopmentDomain', () => {
  it('the software development domain passes the domain schema', () => {
    expect(DomainSchema.safeParse(softwareDevelopmentDomain).success).toBe(true);
    expect(softwareDevelopmentDomain.name).toBe('software_development');
    expect(softwareDevelopmentDomain.correctionPolicy).toBe('automatic');
  });

  it.each(SCENARIO_CASES)(
    'every scenario case can be expressed with the domain: $scenario, $predicate',
    (row) => {
      const predicate = softwareDevelopmentDomain.predicates.find(
        (defined) => defined.name === row.predicate,
      );
      expect(softwareDevelopmentDomain.entityTypes).toContain(row.subjectType);
      if (row.objectEntityType !== null)
        expect(softwareDevelopmentDomain.entityTypes).toContain(row.objectEntityType);
      expect(predicate?.cardinality).toBe(row.cardinality);
    },
  );

  it('covers all eleven scenario cases', () => {
    expect(new Set(SCENARIO_CASES.map((row) => row.scenario)).size).toBe(11);
  });

  it('the software development domain has a type for a function or symbol', () => {
    expect(softwareDevelopmentDomain.entityTypes).toContain('symbol');
    const describedAs = softwareDevelopmentDomain.predicates.find(
      (predicate) => predicate.name === 'described_as',
    );
    expect(describedAs?.cardinality).toBe('multi');
  });

  it("the software development domain has a single-valued predicate for a dependency's version", () => {
    const pinsVersion = softwareDevelopmentDomain.predicates.find(
      (predicate) => predicate.name === 'pins_version',
    );
    expect(pinsVersion?.cardinality).toBe('single');
    expect(pinsVersion?.description).toContain('dependency');
  });

  it('the software development domain has a single-valued predicate for the file a symbol is defined in', () => {
    const definedIn = softwareDevelopmentDomain.predicates.find(
      (predicate) => predicate.name === 'defined_in',
    );
    expect(definedIn?.cardinality).toBe('single');
    expect(definedIn?.description).toContain('symbol');
  });

  it('has exactly five entity types and nine predicates', () => {
    expect(softwareDevelopmentDomain.entityTypes).toEqual([
      'repository',
      'dependency',
      'convention',
      'decision',
      'symbol',
    ]);
    expect(softwareDevelopmentDomain.predicates.map((predicate) => predicate.name)).toEqual([
      'uses_test_framework',
      'uses_package_manager',
      'deploys_to',
      'listens_on_port',
      'follows_convention',
      'has_status',
      'pins_version',
      'described_as',
      'defined_in',
    ]);
  });

  it('names every entity type and predicate in lower-case snake case, each once', () => {
    const names = [
      ...softwareDevelopmentDomain.entityTypes,
      ...softwareDevelopmentDomain.predicates.map((predicate) => predicate.name),
    ];
    for (const name of names) expect(name).toMatch(SNAKE_CASE);
    expect(new Set(softwareDevelopmentDomain.entityTypes).size).toBe(
      softwareDevelopmentDomain.entityTypes.length,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('describes each predicate in one sentence with an example', () => {
    for (const predicate of softwareDevelopmentDomain.predicates) {
      expect(predicate.description).toContain('for example');
      expect(predicate.description).toContain(predicate.name);
      expect(predicate.description.split('. ').length).toBe(1);
    }
  });
});
