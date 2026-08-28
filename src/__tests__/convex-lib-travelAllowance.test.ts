import {
  resolveTravelAllowance,
  resolveTravelAllowanceWithOverride,
  validateTravelAllowanceOverride,
  validateTravelAllowancePolicy,
  DEFAULT_TRAVEL_ALLOWANCE_POLICY,
  LEGACY_TRAVEL_ALLOWANCE_POLICY,
} from '../../convex/lib/travelAllowance';
// Same functions re-exported from convex/lib — test the client copy for pure logic
// (convex/lib/travelAllowance.ts re-exports from src/lib/travelAllowance.ts)

const POLICY = {
  enabled: true,
  staffAmount: 20000,
  contractorAmount: 12000,
};

describe('DEFAULT_TRAVEL_ALLOWANCE_POLICY', () => {
  it('is disabled by default', () => {
    expect(DEFAULT_TRAVEL_ALLOWANCE_POLICY.enabled).toBe(false);
    expect(DEFAULT_TRAVEL_ALLOWANCE_POLICY.staffAmount).toBe(0);
    expect(DEFAULT_TRAVEL_ALLOWANCE_POLICY.contractorAmount).toBe(0);
  });
});

describe('LEGACY_TRAVEL_ALLOWANCE_POLICY', () => {
  it('reflects the original hardcoded amounts', () => {
    expect(LEGACY_TRAVEL_ALLOWANCE_POLICY.enabled).toBe(true);
    expect(LEGACY_TRAVEL_ALLOWANCE_POLICY.staffAmount).toBe(20000);
    expect(LEGACY_TRAVEL_ALLOWANCE_POLICY.contractorAmount).toBe(12000);
  });
});

describe('resolveTravelAllowance', () => {
  it('returns 0 when policy is undefined', () => {
    expect(resolveTravelAllowance(undefined, 'staff')).toBe(0);
  });

  it('returns 0 when policy is disabled', () => {
    expect(resolveTravelAllowance({ enabled: false, staffAmount: 20000, contractorAmount: 12000 }, 'staff')).toBe(0);
  });

  it('returns staffAmount for staff', () => {
    expect(resolveTravelAllowance(POLICY, 'staff')).toBe(20000);
  });

  it('returns contractorAmount for contractor', () => {
    expect(resolveTravelAllowance(POLICY, 'contractor')).toBe(12000);
  });

  it('defaults to staffAmount when employeeType is undefined', () => {
    expect(resolveTravelAllowance(POLICY, undefined)).toBe(20000);
  });
});

describe('resolveTravelAllowanceWithOverride', () => {
  it('returns the override when present', () => {
    expect(resolveTravelAllowanceWithOverride(POLICY, 'staff', 30000)).toBe(30000);
  });

  it('returns override even when policy is disabled', () => {
    expect(resolveTravelAllowanceWithOverride(DEFAULT_TRAVEL_ALLOWANCE_POLICY, 'staff', 15000)).toBe(15000);
  });

  it('returns override of 0 (explicit opt-out)', () => {
    expect(resolveTravelAllowanceWithOverride(POLICY, 'staff', 0)).toBe(0);
  });

  it('falls back to policy when override is undefined', () => {
    expect(resolveTravelAllowanceWithOverride(POLICY, 'staff', undefined)).toBe(20000);
  });

  it('falls back to disabled policy when override is undefined', () => {
    expect(resolveTravelAllowanceWithOverride(DEFAULT_TRAVEL_ALLOWANCE_POLICY, 'staff', undefined)).toBe(0);
  });
});

describe('validateTravelAllowanceOverride', () => {
  it('accepts 0', () => {
    expect(() => validateTravelAllowanceOverride(0)).not.toThrow();
  });

  it('accepts positive numbers', () => {
    expect(() => validateTravelAllowanceOverride(12345)).not.toThrow();
  });

  it('rejects negative numbers', () => {
    expect(() => validateTravelAllowanceOverride(-1)).toThrow('non-negative');
  });

  it('rejects NaN', () => {
    expect(() => validateTravelAllowanceOverride(NaN)).toThrow('non-negative');
  });

  it('rejects Infinity', () => {
    expect(() => validateTravelAllowanceOverride(Infinity)).toThrow('non-negative');
  });
});

describe('validateTravelAllowancePolicy', () => {
  it('accepts a valid policy', () => {
    expect(() => validateTravelAllowancePolicy(POLICY)).not.toThrow();
  });

  it('rejects negative staffAmount', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: true, staffAmount: -1, contractorAmount: 12000 }),
    ).toThrow('Staff');
  });

  it('rejects negative contractorAmount', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: true, staffAmount: 20000, contractorAmount: -1 }),
    ).toThrow('Contractor');
  });

  it('rejects NaN staffAmount', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: true, staffAmount: NaN, contractorAmount: 12000 }),
    ).toThrow('Staff');
  });
});
