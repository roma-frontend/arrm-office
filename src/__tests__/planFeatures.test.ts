/**
 * Tests for the plan features matrix — verifies feature gating by subscription tier.
 *
 * Focus: strategyMaps feature (Professional+ only)
 */
import { PLAN_FEATURES, PLAN_LABELS, PLAN_PRICES, planIncludes } from '@/hooks/usePlanFeatures';

describe('PLAN_FEATURES.starter', () => {
  const features = PLAN_FEATURES.starter;

  it('has strategyMaps: false (Starter does NOT get strategy maps)', () => {
    expect(features.strategyMaps).toBe(false);
  });

  it('has analytics: true', () => {
    expect(features.analytics).toBe(true);
  });

  it('has a finite maxEmployees', () => {
    expect(features.maxEmployees).toBeGreaterThan(0);
    expect(features.maxEmployees).toBeLessThan(Infinity);
  });
});

describe('PLAN_FEATURES.professional', () => {
  const features = PLAN_FEATURES.professional;

  it('has strategyMaps: true (Professional gets strategy maps)', () => {
    expect(features.strategyMaps).toBe(true);
  });

  it('has advancedAnalytics: true', () => {
    expect(features.advancedAnalytics).toBe(true);
  });
});

describe('PLAN_FEATURES.enterprise', () => {
  const features = PLAN_FEATURES.enterprise;

  it('has strategyMaps: true (Enterprise gets strategy maps)', () => {
    expect(features.strategyMaps).toBe(true);
  });

  it('has unlimited maxEmployees', () => {
    expect(features.maxEmployees).toBe(Infinity);
  });
});

describe('strategyMaps gating', () => {
  it('is false on starter — upgrade needed', () => {
    expect(PLAN_FEATURES.starter.strategyMaps).toBe(false);
  });

  it('is true on professional', () => {
    expect(PLAN_FEATURES.professional.strategyMaps).toBe(true);
  });

  it('is true on enterprise', () => {
    expect(PLAN_FEATURES.enterprise.strategyMaps).toBe(true);
  });

  it('requires professional plan at minimum', () => {
    // Verify that starter does NOT have it
    expect(PLAN_FEATURES.starter.strategyMaps).toBe(false);
    // Verify professional DOES have it
    expect(PLAN_FEATURES.professional.strategyMaps).toBe(true);
  });
});

describe('PLAN_LABELS', () => {
  it('has labels for all plan types', () => {
    expect(PLAN_LABELS.starter).toBe('Starter');
    expect(PLAN_LABELS.professional).toBe('Professional');
    expect(PLAN_LABELS.enterprise).toBe('Enterprise');
  });
});

describe('PLAN_PRICES', () => {
  it('has prices for all plan types', () => {
    expect(PLAN_PRICES.starter).toContain('$');
    expect(PLAN_PRICES.professional).toContain('$');
    expect(PLAN_PRICES.enterprise).toContain('Custom');
  });
});

describe('planIncludes', () => {
  it('returns true when current plan is the same as required', () => {
    expect(planIncludes('professional', 'professional')).toBe(true);
  });

  it('returns true when current plan is higher tier', () => {
    expect(planIncludes('enterprise', 'professional')).toBe(true);
    expect(planIncludes('enterprise', 'starter')).toBe(true);
    expect(planIncludes('professional', 'starter')).toBe(true);
  });

  it('returns false when current plan is lower tier', () => {
    expect(planIncludes('starter', 'professional')).toBe(false);
    expect(planIncludes('starter', 'enterprise')).toBe(false);
    expect(planIncludes('professional', 'enterprise')).toBe(false);
  });
});
