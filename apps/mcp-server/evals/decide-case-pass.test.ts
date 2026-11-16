import { err, ok } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { decideCasePass } from './decide-case-pass.ts';
import type { CaseFact, ExtractionCase } from './extraction-case.ts';

function deploysTo(target: string): CaseFact {
  return {
    subject: { type: 'repository', name: 'shop-api' },
    predicate: 'deploys_to',
    object: { value: target },
    valid_from: null,
    valid_to: null,
  };
}

const CASE: ExtractionCase = {
  name: 'A plan: an example',
  kinds: ['plan'],
  observed_at: '2026-05-11',
  text: 'docs-site is deployed to Netlify. Next quarter we may move it to Kubernetes.',
  expected: [
    { ...deploysTo('Netlify'), required: true },
    { ...deploysTo('Render'), required: false },
  ],
  forbidden: [deploysTo('Kubernetes')],
};

describe('decideCasePass', () => {
  it('passes a case when every required fact is matched', () => {
    expect(decideCasePass(CASE, ok([deploysTo('NETLIFY')]))).toBe(true);
  });

  it('fails a case when a required fact is missing', () => {
    expect(decideCasePass(CASE, ok([deploysTo('Render')]))).toBe(false);
  });

  it('fails a case when a forbidden fact is extracted', () => {
    expect(decideCasePass(CASE, ok([deploysTo('Netlify'), deploysTo('Kubernetes')]))).toBe(false);
  });

  it('fails a case when remember fails', () => {
    expect(decideCasePass({ ...CASE, expected: [], forbidden: [] }, err('llm_failed', 'No key.'))).toBe(
      false,
    );
  });

  it('passes a case with nothing required when nothing forbidden is extracted', () => {
    expect(decideCasePass({ ...CASE, expected: [] }, ok([]))).toBe(true);
  });
});
