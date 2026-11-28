import { DomainSchema } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { healthcareDomain } from './healthcare-domain.ts';

describe('the healthcare domain', () => {
  it('is a valid domain', () => {
    expect(DomainSchema.safeParse(healthcareDomain).success).toBe(true);
  });

  it('holds every change to a stored fact for a person to approve', () => {
    expect(healthcareDomain.correctionPolicy).toBe('human_approval');
  });
});
