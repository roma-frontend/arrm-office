import { describe, it, expect } from '@jest/globals';
import {
  isHrefAllowed,
  isHrefLocked,
  moduleKeyForPath,
  type OrgEntitlements,
} from '@/lib/planGating';

jest.mock('@/hooks/useOrgEntitlements', () => ({
  useOrgEntitlements: () => ({ entitlements: null, hasModule: () => true, getLimit: () => null }),
}));

const entitlements: OrgEntitlements = {
  planKey: 'pro',
  planName: 'Pro',
  planVersion: 1,
  isTrial: false,
  source: 'billing',
  moduleMap: {
    employees: { included: true, overLimit: 'block' },
    payroll: { included: false, overLimit: 'block' },
  },
};

describe('moduleKeyForPath', () => {
  it('maps exact routes to their module', () => {
    expect(moduleKeyForPath('/payroll')).toBe('payroll');
    expect(moduleKeyForPath('/employees/departments')).toBe('departments');
    expect(moduleKeyForPath('/team')).toBe('employees');
    expect(moduleKeyForPath('/ai-chat')).toBe('aiAssistant');
  });

  it('falls back to the parent module for child routes', () => {
    expect(moduleKeyForPath('/payroll/run/123')).toBe('payroll');
    expect(moduleKeyForPath('/employees/u1/profile')).toBe('employees');
  });

  it('prefers the most specific route over the parent', () => {
    expect(moduleKeyForPath('/employees/departments')).toBe('departments');
    expect(moduleKeyForPath('/employees/positions')).toBe('positions');
  });

  it('returns undefined for ungated routes', () => {
    expect(moduleKeyForPath('/profile')).toBeUndefined();
    expect(moduleKeyForPath('/settings')).toBeUndefined();
    expect(moduleKeyForPath('/superadmin/plans')).toBeUndefined();
    expect(moduleKeyForPath('/')).toBeUndefined();
    expect(moduleKeyForPath('')).toBeUndefined();
  });
});

describe('isHrefAllowed / isHrefLocked', () => {
  it('locks gated routes whose module is excluded from the plan', () => {
    expect(isHrefLocked(entitlements, '/payroll')).toBe(true);
    expect(isHrefAllowed(entitlements, '/payroll')).toBe(false);
  });

  it('allows included modules and ungated routes', () => {
    expect(isHrefLocked(entitlements, '/employees')).toBe(false);
    expect(isHrefAllowed(entitlements, '/employees')).toBe(true);
    expect(isHrefLocked(entitlements, '/profile')).toBe(false);
    expect(isHrefAllowed(entitlements, '/profile')).toBe(true);
  });

  it('is permissive while entitlements are loading', () => {
    expect(isHrefLocked(null, '/payroll')).toBe(false);
    expect(isHrefAllowed(null, '/payroll')).toBe(true);
  });
});
