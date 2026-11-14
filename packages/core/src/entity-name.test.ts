import { describe, expect, it } from 'vitest';
import { normaliseEntityName } from './entity-name.ts';

describe('normaliseEntityName', () => {
  it('lower-cases, trims and collapses white space', () => {
    expect(normaliseEntityName('  Example  Repo ')).toBe('example repo');
    expect(normaliseEntityName('PostgreSQL')).toBe('postgresql');
    expect(normaliseEntityName('src/Auth\tModule\n')).toBe('src/auth module');
  });

  it('leaves a name that is already normal as it is', () => {
    expect(normaliseEntityName('example repo')).toBe('example repo');
  });
});
