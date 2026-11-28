import { describe, expect, it } from 'vitest';
import { readCommand } from './read-command.ts';

describe('readCommand', () => {
  it('reads import fhir with a file as the FHIR import, and refuses it without one', () => {
    expect(readCommand(['import', 'fhir', 'bundle.json'])).toEqual({
      kind: 'import_fhir',
      path: 'bundle.json',
    });
    expect(readCommand(['import', 'fhir']).kind).toBe('invalid');
  });

  it('reads demo healthcare as the demo', () => {
    expect(readCommand(['demo', 'healthcare'])).toEqual({ kind: 'demo_healthcare' });
  });
});
