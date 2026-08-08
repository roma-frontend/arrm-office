/**
 * Tests for the branches of convex/drivers/driver_registration.ts that
 * convex-drivers-auth.test.ts leaves open:
 *
 *   - registerAsDriver: the cross-organization caller guard, and the by_user
 *     index predicate (its chain mock never executes withIndex callbacks);
 *   - addFavoriteDriver: resolving the org from the driver record when the
 *     caller passes none, and the "Organization not found" fallback;
 *   - the by_user_driver index predicates in both favorite mutations.
 *
 * The db.query chain mock EXECUTES withIndex predicates, so the index
 * callbacks in the module count as covered.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let driverRegistration: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const adminA = {
  _id: 'user-admin',
  name: 'Admin A',
  email: 'aa@a.com',
  role: 'admin',
  organizationId: ORG_A,
};
const adminB = {
  _id: 'user-admin-b',
  name: 'Admin B',
  email: 'ab@b.com',
  role: 'admin',
  organizationId: ORG_B,
};
const callerA = {
  _id: 'user-1',
  name: 'User A',
  email: 'a@a.com',
  role: 'employee',
  organizationId: ORG_A,
};

const sampleDriver = {
  _id: 'driver-1' as any,
  userId: 'user-driver',
  organizationId: ORG_A,
  isAvailable: true,
  vehicleInfo: { model: 'Toyota', plateNumber: 'ABC123', capacity: 4 },
  workingHours: { startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5] },
  maxTripsPerDay: 10,
  rating: 5.0,
  totalTrips: 0,
};

/**
 * Per-table query chains that execute withIndex predicates against a shared
 * query-builder mock, so the index callbacks in the module actually run and
 * the same chain is reused across the handler and the assertions.
 */
function makeCtx(queryResult?: any) {
  const chains = new Map<string, any>();
  const makeChain = () => {
    const q: any = { eq: jest.fn(() => q), field: jest.fn(() => q) };
    const chain: any = {
      withIndex: jest.fn((_index: string, pred?: (qb: any) => unknown) => {
        if (pred) pred(q);
        return chain;
      }),
      filter: jest.fn(() => chain),
      order: jest.fn(() => chain),
      take: async () => (typeof queryResult === 'function' ? queryResult() : queryResult),
      first: async () => (typeof queryResult === 'function' ? queryResult() : queryResult),
      unique: async () => (typeof queryResult === 'function' ? queryResult() : queryResult),
      paginate: async () => ({ page: queryResult ?? [], continueCursor: '', isDone: true }),
    };
    return chain;
  };
  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      delete: mockDelete,
      query: (table: string) => {
        if (!chains.has(table)) chains.set(table, makeChain());
        return chains.get(table);
      },
    },
    chain: (table: string) => chains.get(table),
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;

    mockGet = jest.fn();
    mockInsert = jest.fn();
    mockPatch = jest.fn();
    mockDelete = jest.fn();

    driverRegistration = require('../../convex/drivers/driver_registration');
  });
});

// ── registerAsDriver: cross-org guard + index predicate ─────────────────────
describe('drivers.registerAsDriver remaining branches', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  const basicArgs = {
    organizationId: ORG_A,
    userId: 'user-2' as any,
    vehicleInfo: { model: 'Tesla', plateNumber: 'EV123', capacity: 4 },
    workingHours: { startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5] },
    maxTripsPerDay: 8,
  };

  it('rejects an admin of another organization registering into this one', async () => {
    // The user belongs to the target org, but the caller is pinned to ORG_B.
    mockGetAuthCaller.mockResolvedValue(adminB);
    mockGet.mockResolvedValueOnce({ _id: 'user-2', organizationId: ORG_A });

    await expect(
      driverRegistration.registerAsDriver.handler(makeCtx(null), basicArgs),
    ).rejects.toThrow('Access denied: cross-organization operation');
  });

  it('runs the by_user index predicate when checking for an existing driver', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet.mockResolvedValueOnce({ _id: 'user-2', organizationId: ORG_A }); // userToRegister

    const ctx = makeCtx(null); // no existing driver record
    mockInsert.mockResolvedValue('new-driver-id');
    await driverRegistration.registerAsDriver.handler(ctx, basicArgs);

    // The chain executes the predicate, and the query targets the by_user index.
    expect(ctx.chain('drivers').withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });
});

// ── addFavoriteDriver: org resolution from the driver record ─────────────────
describe('drivers.addFavoriteDriver remaining branches', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('resolves the organization from the driver record when none is passed', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // org lookup from the driver record, then no existing favorite.
    mockGet.mockResolvedValueOnce(sampleDriver).mockResolvedValueOnce(null);

    const ctx = makeCtx(null);
    await driverRegistration.addFavoriteDriver.handler(ctx, {
      driverId: 'driver-1' as any,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      'favoriteDrivers',
      expect.objectContaining({
        userId: 'user-1',
        driverId: 'driver-1',
        organizationId: ORG_A, // taken from the driver, not from args
      }),
    );
  });

  it('throws when neither the args nor the driver provide an organization', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(null); // driver record missing

    await expect(
      driverRegistration.addFavoriteDriver.handler(makeCtx(null), {
        driverId: 'driver-1' as any,
      }),
    ).rejects.toThrow('Organization not found');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('runs the by_user_driver index predicate when looking for an existing favorite', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // org provided via args, so no driver lookup happens at all.

    const ctx = makeCtx(null); // no existing favorite
    await driverRegistration.addFavoriteDriver.handler(ctx, {
      organizationId: ORG_A,
      driverId: 'driver-1' as any,
    });

    expect(ctx.chain('favoriteDrivers').withIndex).toHaveBeenCalledWith(
      'by_user_driver',
      expect.any(Function),
    );
  });
});

// ── removeFavoriteDriver: index predicate + no-op path ──────────────────────
describe('drivers.removeFavoriteDriver remaining branches', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('runs the by_user_driver index predicate and deletes the favorite', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx({ _id: 'fav-1', userId: 'user-1', driverId: 'driver-1' });

    const result = await driverRegistration.removeFavoriteDriver.handler(ctx, {
      driverId: 'driver-1' as any,
    });

    expect(result.success).toBe(true);
    expect(ctx.chain('favoriteDrivers').withIndex).toHaveBeenCalledWith(
      'by_user_driver',
      expect.any(Function),
    );
    expect(mockDelete).toHaveBeenCalledWith('fav-1');
  });

  it('succeeds silently when there is no favorite to remove', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx(null); // no existing favorite

    const result = await driverRegistration.removeFavoriteDriver.handler(ctx, {
      driverId: 'driver-1' as any,
    });

    expect(result.success).toBe(true);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('drivers.updateDriverAvailability missing driver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('throws when the driver record does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet.mockResolvedValueOnce(null); // no driver record

    await expect(
      driverRegistration.updateDriverAvailability.handler(makeCtx(null), {
        driverId: 'driver-ghost' as any,
        isAvailable: true,
      }),
    ).rejects.toThrow('Driver not found');
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
