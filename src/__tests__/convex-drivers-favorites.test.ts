/**
 * Tests for convex/drivers/requests_queries.getFavoriteDrivers — organization
 * scoping.
 *
 * The query used to read favoriteDrivers by userId alone. Because a favourite
 * belongs to a (user, organization) pair, that leaked drivers across tenants: a
 * superadmin browsing organization B was shown the drivers they had saved in
 * organization A, and any user moved between organizations kept seeing the
 * drivers of the organization they had left.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  query: ({ handler, args }: any) => ({ handler, args }),
  mutation: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

let requestsQueries: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockGet: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const employeeA = {
  _id: 'user-1' as any,
  name: 'User A',
  email: 'a@a.com',
  role: 'employee' as const,
  organizationId: ORG_A,
};

const superadminInA = {
  _id: 'user-super' as any,
  name: 'Super',
  email: 's@s.com',
  role: 'superadmin' as const,
  organizationId: ORG_A,
};

const driverInA = {
  _id: 'driver-a' as any,
  userId: 'user-driver-a' as any,
  organizationId: ORG_A,
  vehicleInfo: { model: 'Toyota', plateNumber: 'AAA111', capacity: 4 },
  rating: 5,
  totalTrips: 3,
};

const driverInB = {
  _id: 'driver-b' as any,
  userId: 'user-driver-b' as any,
  organizationId: ORG_B,
  vehicleInfo: { model: 'Kia', plateNumber: 'BBB222', capacity: 4 },
  rating: 4,
  totalTrips: 7,
};

const driverUsers: Record<string, unknown> = {
  'user-driver-a': { _id: 'user-driver-a', name: 'Driver A', organizationId: ORG_A },
  'user-driver-b': { _id: 'user-driver-b', name: 'Driver B', organizationId: ORG_B },
};

/** Captures the index name and predicate the handler used. */
let lastIndex: { name: string; bounds: Record<string, unknown> } | null = null;

function makeCtx(favorites: unknown[]) {
  const chain: any = {
    withIndex: (name: string, cb?: (q: any) => unknown) => {
      const bounds: Record<string, unknown> = {};
      const q = {
        eq: (field: string, value: unknown) => {
          bounds[field] = value;
          return q;
        },
      };
      if (typeof cb === 'function') cb(q);
      lastIndex = { name, bounds };
      return chain;
    },
    filter: () => chain,
    order: () => chain,
    take: async () => favorites,
    first: async () => favorites[0] ?? null,
  };

  return {
    db: {
      get: mockGet,
      query: () => chain,
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    mockGet = jest.fn();

    requestsQueries = require('../../convex/drivers/requests_queries');
  });
});

beforeEach(() => {
  jest.resetAllMocks();
  lastIndex = null;
  mockGetProfile.mockResolvedValue(null);
  // Resolve driver records and their user records by id.
  mockGet.mockImplementation(async (id: string) => {
    if (id === driverInA._id) return driverInA;
    if (id === driverInB._id) return driverInB;
    return driverUsers[id] ?? null;
  });
});

describe('drivers.getFavoriteDrivers organization scoping', () => {
  it('returns nothing for an unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await requestsQueries.getFavoriteDrivers.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });

  it("reads the index scoped to the caller's organization by default", async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    await requestsQueries.getFavoriteDrivers.handler(
      makeCtx([{ driverId: driverInA._id, organizationId: ORG_A, createdAt: 1 }]),
      {},
    );

    expect(lastIndex?.name).toBe('by_user_org');
    expect(lastIndex?.bounds).toEqual({ userId: employeeA._id, organizationId: ORG_A });
  });

  it('refuses to read another organization for a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    const result = await requestsQueries.getFavoriteDrivers.handler(
      makeCtx([{ driverId: driverInB._id, organizationId: ORG_B, createdAt: 1 }]),
      { organizationId: ORG_B },
    );

    expect(result).toEqual([]);
  });

  it('scopes a superadmin to the organization they are browsing', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);

    await requestsQueries.getFavoriteDrivers.handler(
      makeCtx([{ driverId: driverInB._id, organizationId: ORG_B, createdAt: 1 }]),
      { organizationId: ORG_B },
    );

    expect(lastIndex?.bounds).toEqual({ userId: superadminInA._id, organizationId: ORG_B });
  });

  it('drops rows whose driver has since moved to another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    // A stale row: filed under ORG_A, but the driver record now says ORG_B.
    const result = await requestsQueries.getFavoriteDrivers.handler(
      makeCtx([
        { driverId: driverInA._id, organizationId: ORG_A, createdAt: 1 },
        { driverId: driverInB._id, organizationId: ORG_A, createdAt: 2 },
      ]),
      {},
    );

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(driverInA._id);
  });

  it('returns nothing when no organization can be resolved', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...employeeA, organizationId: undefined });
    mockIsSuperadmin.mockReturnValue(false);

    const result = await requestsQueries.getFavoriteDrivers.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });
});
