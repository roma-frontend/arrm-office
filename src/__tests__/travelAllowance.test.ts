/**
 * Tests for the travel (transport) allowance policy logic.
 *
 * Two layers are covered:
 *  - src/lib/travelAllowance.ts — pure policy resolution & validation shared
 *    by the client and the Convex backend.
 *  - convex/lib/travelAllowance.ts — database-aware helpers
 *    (getTravelAllowancePolicy / resolveTravelAllowanceForOrg) that re-export
 *    the pure logic, so loading the backend module also exercises the client
 *    file.
 *
 * The Convex module imports only *types* from `../_generated/*`, so no
 * jest.mock of the generated server is required — only a fake query chain.
 */

import {
  DEFAULT_TRAVEL_ALLOWANCE_POLICY,
  LEGACY_TRAVEL_ALLOWANCE_POLICY,
  resolveTravelAllowance,
  validateTravelAllowancePolicy,
  type TravelAllowancePolicy,
} from '@/lib/travelAllowance';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const backend = require('../../convex/lib/travelAllowance');

const ORG_ID = 'org-123';

/** Fake query chain that invokes the withIndex predicate and returns a row. */
function makeCtx(settingsRow?: { travelAllowance?: TravelAllowancePolicy } | null) {
  const chain: any = {
    withIndex: jest.fn((_name: string, cb?: (q: any) => unknown) => {
      if (typeof cb === 'function') cb({ eq: () => chain });
      return chain;
    }),
    first: jest.fn(async () => settingsRow ?? null),
    eq: jest.fn(() => chain),
  };
  return {
    db: { query: jest.fn(() => chain), _chain: chain },
  };
}

// ── Pure logic: resolveTravelAllowance ───────────────────────────────────────

describe('resolveTravelAllowance', () => {
  const enabled: TravelAllowancePolicy = {
    enabled: true,
    staffAmount: 20000,
    contractorAmount: 12000,
  };

  it('returns 0 when the policy is disabled', () => {
    expect(
      resolveTravelAllowance(
        { enabled: false, staffAmount: 20000, contractorAmount: 12000 },
        'staff',
      ),
    ).toBe(0);
  });

  it('returns 0 when the policy is undefined', () => {
    expect(resolveTravelAllowance(undefined, 'staff')).toBe(0);
  });

  it('returns 0 when the policy has no enabled flag', () => {
    expect(
      resolveTravelAllowance({ enabled: false, staffAmount: 0, contractorAmount: 0 }, 'contractor'),
    ).toBe(0);
  });

  it('resolves the contractor amount for contractors', () => {
    expect(resolveTravelAllowance(enabled, 'contractor')).toBe(12000);
  });

  it('resolves the staff amount for staff', () => {
    expect(resolveTravelAllowance(enabled, 'staff')).toBe(20000);
  });

  it('treats an unknown employee type as staff', () => {
    expect(resolveTravelAllowance(enabled, undefined)).toBe(20000);
  });
});

// ── Pure logic: validateTravelAllowancePolicy ────────────────────────────────

describe('validateTravelAllowancePolicy', () => {
  it('accepts a valid policy without throwing', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: true, staffAmount: 15000, contractorAmount: 0 }),
    ).not.toThrow();
  });

  it('accepts zero amounts', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: false, staffAmount: 0, contractorAmount: 0 }),
    ).not.toThrow();
  });

  it('rejects a negative staff amount', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: true, staffAmount: -1, contractorAmount: 100 }),
    ).toThrow('Staff travel allowance must be a non-negative number');
  });

  it('rejects a negative contractor amount', () => {
    expect(() =>
      validateTravelAllowancePolicy({ enabled: true, staffAmount: 100, contractorAmount: -5 }),
    ).toThrow('Contractor travel allowance must be a non-negative number');
  });

  it('rejects NaN amounts', () => {
    expect(() =>
      validateTravelAllowancePolicy({
        enabled: true,
        staffAmount: Number.NaN,
        contractorAmount: 100,
      }),
    ).toThrow('Staff travel allowance must be a non-negative number');
  });

  it('rejects Infinity amounts', () => {
    expect(() =>
      validateTravelAllowancePolicy({
        enabled: true,
        staffAmount: 100,
        contractorAmount: Infinity,
      }),
    ).toThrow('Contractor travel allowance must be a non-negative number');
  });
});

// ── Policy constants ─────────────────────────────────────────────────────────

describe('travel allowance policy constants', () => {
  it('defaults to a disabled policy with zero amounts (opt-in)', () => {
    expect(DEFAULT_TRAVEL_ALLOWANCE_POLICY).toEqual({
      enabled: false,
      staffAmount: 0,
      contractorAmount: 0,
    });
  });

  it('preserves the legacy hardcoded amounts for the backfill migration', () => {
    expect(LEGACY_TRAVEL_ALLOWANCE_POLICY).toEqual({
      enabled: true,
      staffAmount: 20000,
      contractorAmount: 12000,
    });
  });

  it('re-exports the pure logic from the backend module', () => {
    expect(backend.resolveTravelAllowance).toBe(resolveTravelAllowance);
    expect(backend.validateTravelAllowancePolicy).toBe(validateTravelAllowancePolicy);
    expect(backend.DEFAULT_TRAVEL_ALLOWANCE_POLICY).toBe(DEFAULT_TRAVEL_ALLOWANCE_POLICY);
    expect(backend.LEGACY_TRAVEL_ALLOWANCE_POLICY).toBe(LEGACY_TRAVEL_ALLOWANCE_POLICY);
  });
});

// ── Database helpers: getTravelAllowancePolicy ──────────────────────────────

describe('getTravelAllowancePolicy (convex/lib)', () => {
  const customPolicy: TravelAllowancePolicy = {
    enabled: true,
    staffAmount: 30000,
    contractorAmount: 18000,
  };

  it('returns the opt-out default when no organization is given', async () => {
    const ctx = makeCtx(null);
    const policy = await backend.getTravelAllowancePolicy(ctx, undefined);
    expect(policy).toBe(DEFAULT_TRAVEL_ALLOWANCE_POLICY);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it('returns the saved policy when salarySettings exist', async () => {
    const ctx = makeCtx({ travelAllowance: customPolicy });
    const policy = await backend.getTravelAllowancePolicy(ctx, ORG_ID);
    expect(policy).toEqual(customPolicy);
    expect(ctx.db.query).toHaveBeenCalledWith('salarySettings');
    expect(ctx.db._chain.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('falls back to the default when settings exist without a policy field', async () => {
    const ctx = makeCtx({});
    const policy = await backend.getTravelAllowancePolicy(ctx, ORG_ID);
    expect(policy).toBe(DEFAULT_TRAVEL_ALLOWANCE_POLICY);
  });

  it('falls back to the default when no salarySettings row exists', async () => {
    const ctx = makeCtx(null);
    const policy = await backend.getTravelAllowancePolicy(ctx, ORG_ID);
    expect(policy).toBe(DEFAULT_TRAVEL_ALLOWANCE_POLICY);
  });
});

// ── Database helpers: resolveTravelAllowanceForOrg ───────────────────────────

describe('resolveTravelAllowanceForOrg (convex/lib)', () => {
  it('resolves 0 when the org never configured a policy', async () => {
    const result = await backend.resolveTravelAllowanceForOrg(makeCtx(null), ORG_ID, 'staff');
    expect(result).toBe(0);
  });

  it('resolves 0 when the policy is disabled', async () => {
    const result = await backend.resolveTravelAllowanceForOrg(
      makeCtx({ travelAllowance: { enabled: false, staffAmount: 0, contractorAmount: 0 } }),
      ORG_ID,
      'contractor',
    );
    expect(result).toBe(0);
  });

  it('resolves the staff amount from the org policy', async () => {
    const result = await backend.resolveTravelAllowanceForOrg(
      makeCtx({ travelAllowance: { enabled: true, staffAmount: 30000, contractorAmount: 18000 } }),
      ORG_ID,
      'staff',
    );
    expect(result).toBe(30000);
  });

  it('resolves the contractor amount from the org policy', async () => {
    const result = await backend.resolveTravelAllowanceForOrg(
      makeCtx({ travelAllowance: { enabled: true, staffAmount: 30000, contractorAmount: 18000 } }),
      ORG_ID,
      'contractor',
    );
    expect(result).toBe(18000);
  });
});
