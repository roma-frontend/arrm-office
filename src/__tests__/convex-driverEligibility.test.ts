/**
 * Unit tests for convex/lib/driverEligibility.ts — who counts as a fleet
 * driver. Driving is a position flag, with `role === 'driver'` kept as a
 * legacy fallback for pre-flag accounts.
 */

import { jest, describe, it, expect, beforeAll } from '@jest/globals';

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

let driverEligibility: any;
let mockGetProfile: jest.Mock;
let mockGet: jest.Mock;

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    mockGet = jest.fn();
    driverEligibility = require('../../convex/lib/driverEligibility');
  });
});

function makeCtx(positionRows: unknown[] = []) {
  const eqs: Array<[string, unknown]> = [];
  const chain = (table: string) => {
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: (field: string, value: unknown) => (eqs.push([field, value]), q) };
          cb(q);
        }
        return c;
      },
      filter: (cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = {
            field: (name: string) => name,
            eq: (f: string, v: unknown) => (eqs.push([f, v]), q),
          };
          cb(q);
        }
        return c;
      },
      take: async () =>
        table === 'positions'
          ? positionRows.filter((row) =>
              eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value),
            )
          : [],
    };
    return c;
  };
  return {
    db: {
      get: mockGet,
      query: (table: string) => chain(table),
    },
  };
}

describe('isDriverUser (pure predicate)', () => {
  it('returns false for null/undefined users', () => {
    expect(driverEligibility.isDriverUser(null, new Set())).toBe(false);
    expect(driverEligibility.isDriverUser(undefined, new Set())).toBe(false);
  });

  it('matches users whose position is in the driver set', () => {
    const ids = new Set(['pos-1']);
    expect(driverEligibility.isDriverUser({ positionId: 'pos-1' }, ids)).toBe(true);
    expect(driverEligibility.isDriverUser({ positionId: 'pos-2' }, ids)).toBe(false);
  });

  it('falls back to the legacy driver role', () => {
    expect(driverEligibility.isDriverUser({ role: 'driver' }, new Set())).toBe(true);
    expect(driverEligibility.isDriverUser({ role: 'admin' }, new Set())).toBe(false);
  });

  it('lets a flagged position win over a non-driver role', () => {
    expect(
      driverEligibility.isDriverUser({ role: 'employee', positionId: 'pos-1' }, new Set(['pos-1'])),
    ).toBe(true);
  });
});

describe('loadDriverPositionIds', () => {
  it('collects flagged positions for an org via the indexed query', async () => {
    const ctx = makeCtx([
      { _id: 'pos-1', organizationId: 'org-1', isDriverPosition: true },
      { _id: 'pos-2', organizationId: 'org-1', isDriverPosition: true },
      { _id: 'pos-3', organizationId: 'org-1', isDriverPosition: false },
    ]);
    const ids = await driverEligibility.loadDriverPositionIds(ctx, 'org-1');
    expect(ids.has('pos-1')).toBe(true);
    expect(ids.has('pos-2')).toBe(true);
    expect(ids.has('pos-3')).toBe(false);
  });

  it('collects flagged positions platform-wide when no org is passed', async () => {
    const ctx = makeCtx([{ _id: 'pos-1', isDriverPosition: true }]);
    const ids = await driverEligibility.loadDriverPositionIds(ctx);
    expect(ids.has('pos-1')).toBe(true);
  });
});

describe('isDriverUserById', () => {
  it('reads the profile position first when present', async () => {
    mockGet.mockResolvedValueOnce({ _id: 'u1', role: 'admin' });
    mockGetProfile.mockResolvedValueOnce({ positionId: 'pos-1' });
    mockGet.mockResolvedValueOnce({ _id: 'pos-1', isDriverPosition: true });
    expect(await driverEligibility.isDriverUserById(makeCtx(), 'u1')).toBe(true);
  });

  it('falls back to the legacy driver role when nothing is flagged', async () => {
    mockGet.mockResolvedValueOnce({ _id: 'u2', role: 'driver' });
    mockGetProfile.mockResolvedValueOnce(null);
    expect(await driverEligibility.isDriverUserById(makeCtx(), 'u2')).toBe(true);
  });

  it('returns false for missing users and non-driver positions', async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await driverEligibility.isDriverUserById(makeCtx(), 'missing')).toBe(false);

    mockGet.mockResolvedValueOnce({ _id: 'u3', role: 'employee' });
    mockGetProfile.mockResolvedValueOnce({ positionId: 'pos-9' });
    mockGet.mockResolvedValueOnce({ _id: 'pos-9', isDriverPosition: false });
    expect(await driverEligibility.isDriverUserById(makeCtx(), 'u3')).toBe(false);
  });
});
