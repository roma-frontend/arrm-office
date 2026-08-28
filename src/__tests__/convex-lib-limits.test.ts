import {
  SMALL_LIST_CAP,
  DEFAULT_LIST_CAP,
  XLARGE_LIST_CAP,
  PLAN_EMPLOYEE_LIMITS,
} from '../../convex/lib/limits';

describe('List caps', () => {
  it('SMALL_LIST_CAP is positive and <= DEFAULT_LIST_CAP', () => {
    expect(SMALL_LIST_CAP).toBeGreaterThan(0);
    expect(SMALL_LIST_CAP).toBeLessThanOrEqual(DEFAULT_LIST_CAP);
  });

  it('DEFAULT_LIST_CAP is positive and <= XLARGE_LIST_CAP', () => {
    expect(DEFAULT_LIST_CAP).toBeGreaterThan(0);
    expect(DEFAULT_LIST_CAP).toBeLessThanOrEqual(XLARGE_LIST_CAP);
  });

  it('XLARGE_LIST_CAP is below Convex hard limit (16384)', () => {
    expect(XLARGE_LIST_CAP).toBeLessThan(16384);
  });

  it('has expected values', () => {
    expect(SMALL_LIST_CAP).toBe(500);
    expect(DEFAULT_LIST_CAP).toBe(2000);
    expect(XLARGE_LIST_CAP).toBe(8000);
  });
});

describe('PLAN_EMPLOYEE_LIMITS', () => {
  it('has entries for starter, professional, enterprise', () => {
    expect(PLAN_EMPLOYEE_LIMITS.starter).toBeDefined();
    expect(PLAN_EMPLOYEE_LIMITS.professional).toBeDefined();
    expect(PLAN_EMPLOYEE_LIMITS.enterprise).toBeDefined();
  });

  it('starter < professional < enterprise', () => {
    expect(PLAN_EMPLOYEE_LIMITS.starter).toBeLessThan(PLAN_EMPLOYEE_LIMITS.professional);
    expect(PLAN_EMPLOYEE_LIMITS.professional).toBeLessThan(PLAN_EMPLOYEE_LIMITS.enterprise);
  });

  it('has expected values', () => {
    expect(PLAN_EMPLOYEE_LIMITS.starter).toBe(10);
    expect(PLAN_EMPLOYEE_LIMITS.professional).toBe(50);
    expect(PLAN_EMPLOYEE_LIMITS.enterprise).toBe(999999);
  });
});
