/**
 * Tests for convex/drivers/* mutations — auth checks, ownership validation, org scoping.
 *
 * Covers: requests_mutations, calendar_mutations, driver_registration.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING
// ═════════════════════════════════════════════════════════════════════════════

let requestsMutations: any;
let calendarMutations: any;
let driverRegistration: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const callerA = {
  _id: 'user-1' as any,
  name: 'User A',
  email: 'a@a.com',
  role: 'employee' as const,
  organizationId: ORG_A,
};
const adminA = {
  _id: 'user-admin' as any,
  name: 'Admin A',
  email: 'aa@a.com',
  role: 'admin' as const,
  organizationId: ORG_A,
};
const adminB = {
  _id: 'user-admin-b' as any,
  name: 'Admin B',
  email: 'ab@b.com',
  role: 'admin' as const,
  organizationId: ORG_B,
};
const superadmin = {
  _id: 'user-super' as any,
  name: 'Super',
  email: 's@s.com',
  role: 'superadmin' as const,
  organizationId: ORG_A,
};
const driverUser = {
  _id: 'user-driver' as any,
  name: 'Driver',
  email: 'd@a.com',
  role: 'driver' as const,
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

const sampleRequest = {
  _id: 'req-1' as any,
  organizationId: ORG_A,
  requesterId: 'user-1',
  driverId: 'driver-1',
  startTime: Date.now() + 3600000,
  endTime: Date.now() + 7200000,
  tripInfo: { from: 'Office', to: 'Airport', purpose: 'Client meeting', passengerCount: 2 },
  status: 'pending' as const,
};

function makeQueryChain(fakeResult: any) {
  // q mimics the Convex expression builder so withIndex/filter callbacks
  // execute — covering the `q.eq(...)` predicate lines.
  const q: any = {
    eq: (..._args: unknown[]) => q,
    field: (..._args: unknown[]) => q,
    and: (..._args: unknown[]) => q,
    gte: (..._args: unknown[]) => q,
    lte: (..._args: unknown[]) => q,
    neq: (..._args: unknown[]) => q,
    or: (..._args: unknown[]) => q,
  };
  let chain: any = {
    withIndex: (_name: string, cb?: (q: any) => unknown) => {
      if (typeof cb === 'function') cb(q);
      return chain;
    },
    filter: (cb?: (q: any) => unknown) => {
      if (typeof cb === 'function') cb(q);
      return chain;
    },
    order: () => chain,
    take: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    first: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    unique: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    paginate: async () => ({ page: fakeResult ?? [], continueCursor: '', isDone: true }),
  };
  return chain;
}

function makeCtx(queryResult?: any) {
  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      delete: mockDelete,
      query: () => makeQueryChain(queryResult),
    },
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

    requestsMutations = require('../../convex/drivers/requests_mutations');
    calendarMutations = require('../../convex/drivers/calendar_mutations');
    driverRegistration = require('../../convex/drivers/driver_registration');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: respondToDriverRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.respondToDriverRequest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      requestsMutations.respondToDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        driverId: 'driver-1' as any,
        approved: true,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects when request.driverId does not match args.driverId', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet
      .mockResolvedValueOnce({ ...sampleRequest, driverId: 'driver-2' }) // request assigned to different driver
      .mockResolvedValueOnce(sampleDriver); // driver lookup

    await expect(
      requestsMutations.respondToDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        driverId: 'driver-1' as any,
        approved: true,
      }),
    ).rejects.toThrow('Unauthorized');
  });

  it('rejects when caller is not the driver', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(sampleRequest).mockResolvedValueOnce(sampleDriver); // driver has userId: user-driver, not user-1

    await expect(
      requestsMutations.respondToDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        driverId: 'driver-1' as any,
        approved: true,
      }),
    ).rejects.toThrow('Only the assigned driver');
  });

  it('approves request and creates schedule for the driver', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet.mockResolvedValueOnce(sampleRequest).mockResolvedValueOnce(sampleDriver); // driver lookup

    const ctx = makeCtx(null);
    const result = await requestsMutations.respondToDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
      driverId: 'driver-1' as any,
      approved: true,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'approved' }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'driverSchedules',
      expect.objectContaining({ driverId: 'driver-1' }),
    );
    // Audit log
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'driver_request_approved' }),
    );
    // Notification
    expect(mockInsert).toHaveBeenCalledWith(
      'notifications',
      expect.objectContaining({ type: 'driver_request_approved' }),
    );
  });

  it('declines request without creating schedule', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet.mockResolvedValueOnce(sampleRequest).mockResolvedValueOnce(sampleDriver);

    const ctx = makeCtx(null);
    const result = await requestsMutations.respondToDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
      driverId: 'driver-1' as any,
      approved: false,
      declineReason: 'Not available',
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'declined', declineReason: 'Not available' }),
    );
    // Should NOT create a schedule
    const scheduleInserts = mockInsert.mock.calls.filter((c: any) => c[0] === 'driverSchedules');
    expect(scheduleInserts).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: updateDriverRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.updateDriverRequest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      requestsMutations.updateDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-requester, non-admin caller', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser); // not the requester
    mockGet.mockResolvedValueOnce(sampleRequest);

    await expect(
      requestsMutations.updateDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        startTime: Date.now() + 10000,
      }),
    ).rejects.toThrow('Only the requester can edit');
  });

  it('allows requester to update their pending request', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(sampleRequest);

    const ctx = makeCtx(null);
    const result = await requestsMutations.updateDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
      tripInfo: { from: 'Office', to: 'Hotel', purpose: 'Meeting', passengerCount: 3 } as any,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'pending' }));
  });

  it('allows admin to update any request', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet.mockResolvedValueOnce(sampleRequest);

    const ctx = makeCtx(null);
    const result = await requestsMutations.updateDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
      driverId: 'driver-2' as any,
    });

    expect(result.success).toBe(true);
  });

  it('throws when editing cancelled request', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce({ ...sampleRequest, status: 'cancelled' });

    await expect(
      requestsMutations.updateDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
      }),
    ).rejects.toThrow('Cannot edit a cancelled request');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: cancelDriverRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.cancelDriverRequest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      requestsMutations.cancelDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-requester caller', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet.mockResolvedValueOnce(sampleRequest); // requester is user-1, not user-driver

    await expect(
      requestsMutations.cancelDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
      }),
    ).rejects.toThrow('Unauthorized');
  });

  it('cancels request for the requester', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(sampleRequest);

    const ctx = makeCtx(null);
    const result = await requestsMutations.cancelDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'cancelled' }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'driver_request_cancelled' }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: deleteDriverRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.deleteDriverRequest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      requestsMutations.deleteDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-requester, non-admin caller', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet.mockResolvedValueOnce(sampleRequest);

    await expect(
      requestsMutations.deleteDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
      }),
    ).rejects.toThrow('Only the requester can delete');
  });

  it('allows requester to delete their request', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(sampleRequest);

    const ctx = makeCtx(null);
    const result = await requestsMutations.deleteDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('allows superadmin to delete any request', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockIsSuperadmin.mockReturnValue(true);
    mockGet.mockResolvedValueOnce(sampleRequest);

    const ctx = makeCtx(null);
    const result = await requestsMutations.deleteDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
    });
    expect(result.success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: reassignDriverRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.reassignDriverRequest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      requestsMutations.reassignDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        newDriverId: 'driver-2' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-requester caller', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet.mockResolvedValueOnce(sampleRequest);

    await expect(
      requestsMutations.reassignDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        newDriverId: 'driver-2' as any,
      }),
    ).rejects.toThrow('Unauthorized');
  });

  it('rejects reassignment of non-declined requests', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(sampleRequest); // status: 'pending', not 'declined'

    await expect(
      requestsMutations.reassignDriverRequest.handler(makeCtx(null), {
        requestId: 'req-1' as any,
        newDriverId: 'driver-2' as any,
      }),
    ).rejects.toThrow('Only declined requests can be reassigned');
  });

  it('reassigns declined request to new driver', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet
      .mockResolvedValueOnce({ ...sampleRequest, status: 'declined' }) // declined request
      .mockResolvedValueOnce(null); // no overlapping schedule

    const ctx = makeCtx(null);
    const result = await requestsMutations.reassignDriverRequest.handler(ctx, {
      requestId: 'req-1' as any,
      newDriverId: 'driver-2' as any,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({
        driverId: 'driver-2',
        status: 'pending',
      }),
    );
  });

  it('throws when new driver has overlapping schedule', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce({ ...sampleRequest, status: 'declined' }); // request lookup
    // query chain returns overlap → ctx.db.query('driverSchedules').filter(...).first()
    const ctx = makeCtx({ _id: 'overlap-schedule' });

    await expect(
      requestsMutations.reassignDriverRequest.handler(ctx, {
        requestId: 'req-1' as any,
        newDriverId: 'driver-2' as any,
      }),
    ).rejects.toThrow('not available at this time');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: grantCalendarAccess
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.grantCalendarAccess', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      calendarMutations.grantCalendarAccess.handler(makeCtx(null), {
        organizationId: ORG_A,
        viewerId: 'user-2' as any,
        accessLevel: 'busy_only' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('creates new calendar access entry for caller as owner', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(null); // no existing access

    const ctx = makeCtx(null);
    mockInsert.mockResolvedValue('new-access-id');
    const result = await calendarMutations.grantCalendarAccess.handler(ctx, {
      organizationId: ORG_A,
      viewerId: 'user-2' as any,
      accessLevel: 'busy_only' as any,
    });

    expect(result).toBe('new-access-id');
    expect(mockInsert).toHaveBeenCalledWith(
      'calendarAccess',
      expect.objectContaining({
        ownerId: 'user-1', // derived from caller
        viewerId: 'user-2',
        accessLevel: 'busy_only',
      }),
    );
    // Notification sent to viewer
    expect(mockInsert).toHaveBeenCalledWith(
      'notifications',
      expect.objectContaining({
        userId: 'user-2',
        type: 'status_change',
      }),
    );
  });

  it('updates existing calendar access entry', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // query chain returns existing access from first() — no mockGet needed
    const ctx = makeCtx({ _id: 'access-1', ownerId: 'user-1', viewerId: 'user-2', isActive: true });
    await calendarMutations.grantCalendarAccess.handler(ctx, {
      organizationId: ORG_A,
      viewerId: 'user-2' as any,
      accessLevel: 'full' as any,
    });

    expect(mockPatch).toHaveBeenCalledWith(
      'access-1',
      expect.objectContaining({ accessLevel: 'full' }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: revokeCalendarAccess
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.revokeCalendarAccess', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      calendarMutations.revokeCalendarAccess.handler(makeCtx(null), {
        accessId: 'access-1' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-owner caller', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue({ _id: 'access-1', ownerId: 'user-other' }); // not the owner

    await expect(
      calendarMutations.revokeCalendarAccess.handler(makeCtx(null), {
        accessId: 'access-1' as any,
      }),
    ).rejects.toThrow('Only the owner can revoke access');
  });

  it('revokes access for owner caller', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue({ _id: 'access-1', ownerId: 'user-1' }); // owner = caller

    const ctx = makeCtx(null);
    const result = await calendarMutations.revokeCalendarAccess.handler(ctx, {
      accessId: 'access-1' as any,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('access-1', { isActive: false });
  });

  it('handles access not found gracefully (no patch)', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(null); // access not found via ctx.db.get(accessId)

    const ctx = makeCtx(null);
    await calendarMutations.revokeCalendarAccess.handler(ctx, {
      accessId: 'ghost' as any,
    });
    // When access doc doesn't exist, early return before patch
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: requestCalendarAccess
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.requestCalendarAccess', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      calendarMutations.requestCalendarAccess.handler(makeCtx(null), {
        organizationId: ORG_A,
        driverUserId: 'user-driver' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('sends notification to driver', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx(null);
    const result = await calendarMutations.requestCalendarAccess.handler(ctx, {
      organizationId: ORG_A,
      driverUserId: 'user-driver' as any,
    });

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(
      'notifications',
      expect.objectContaining({
        userId: 'user-driver',
        type: 'status_change',
        title: 'Calendar Access Request',
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: registerAsDriver
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.registerAsDriver', () => {
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

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      driverRegistration.registerAsDriver.handler(makeCtx(null), basicArgs),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-admin, non-self registration', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA); // employee, not admin
    mockGet.mockResolvedValueOnce({ _id: 'user-2', organizationId: ORG_A });

    await expect(
      driverRegistration.registerAsDriver.handler(makeCtx(null), basicArgs),
    ).rejects.toThrow('Only organization admins');
  });

  it('allows admin to register another user as driver', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet
      .mockResolvedValueOnce({ _id: 'user-2', organizationId: ORG_A }) // userToRegister
      .mockResolvedValueOnce(null); // no existing driver record

    const ctx = makeCtx(null);
    mockInsert.mockResolvedValue('new-driver-id');
    const result = await driverRegistration.registerAsDriver.handler(ctx, basicArgs);

    expect(result).toBe('new-driver-id');
    expect(mockInsert).toHaveBeenCalledWith(
      'drivers',
      expect.objectContaining({
        userId: 'user-2',
        organizationId: ORG_A,
        isAvailable: true,
      }),
    );
  });

  it('allows self-registration', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet
      .mockResolvedValueOnce({ _id: 'user-1', organizationId: ORG_A }) // userToRegister is self
      .mockResolvedValueOnce(null); // no existing

    const selfArgs = { ...basicArgs, userId: 'user-1' as any };
    const ctx = makeCtx(null);
    mockInsert.mockResolvedValue('driver-id');
    const result = await driverRegistration.registerAsDriver.handler(ctx, selfArgs);
    expect(result).toBe('driver-id');
  });

  it('rejects cross-org registration', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet.mockResolvedValueOnce({ _id: 'user-b', organizationId: ORG_B }); // user in different org

    await expect(
      driverRegistration.registerAsDriver.handler(makeCtx(null), basicArgs),
    ).rejects.toThrow('does not belong to this organization');
  });

  it('updates existing driver record on re-registration', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet.mockResolvedValueOnce({ _id: 'user-2', organizationId: ORG_A }); // ctx.db.get(userId)
    // query chain returns existing driver from first() → existing driver found
    const ctx = makeCtx(sampleDriver);
    const result = await driverRegistration.registerAsDriver.handler(ctx, basicArgs);

    expect(mockPatch).toHaveBeenCalledWith(
      'driver-1',
      expect.objectContaining({
        vehicleInfo: basicArgs.vehicleInfo,
        isAvailable: true,
      }),
    );
    expect(result).toBe('driver-1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: updateDriverAvailability
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.updateDriverAvailability', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      driverRegistration.updateDriverAvailability.handler(makeCtx(null), {
        driverId: 'driver-1' as any,
        isAvailable: false,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects non-driver, non-admin caller', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValueOnce(sampleDriver); // driver.userId = 'user-driver', not 'user-1'

    await expect(
      driverRegistration.updateDriverAvailability.handler(makeCtx(null), {
        driverId: 'driver-1' as any,
        isAvailable: false,
      }),
    ).rejects.toThrow('Only the driver or an admin');
  });

  it('allows driver to update own availability', async () => {
    mockGetAuthCaller.mockResolvedValue(driverUser);
    mockGet.mockResolvedValueOnce(sampleDriver);

    const ctx = makeCtx(null);
    const result = await driverRegistration.updateDriverAvailability.handler(ctx, {
      driverId: 'driver-1' as any,
      isAvailable: false,
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('driver-1', {
      isAvailable: false,
      updatedAt: expect.any(Number),
    });
  });

  it('allows admin to update any driver availability', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockGet.mockResolvedValueOnce(sampleDriver);

    const ctx = makeCtx(null);
    const result = await driverRegistration.updateDriverAvailability.handler(ctx, {
      driverId: 'driver-1' as any,
      isAvailable: true,
    });
    expect(result.success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION: addFavoriteDriver / removeFavoriteDriver
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers.addFavoriteDriver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      driverRegistration.addFavoriteDriver.handler(makeCtx(null), {
        driverId: 'driver-1' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('adds favorite for caller', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet
      .mockResolvedValueOnce(sampleDriver) // org lookup
      .mockResolvedValueOnce(null); // no existing favorite

    const ctx = makeCtx(null);
    await driverRegistration.addFavoriteDriver.handler(ctx, {
      organizationId: ORG_A,
      driverId: 'driver-1' as any,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      'favoriteDrivers',
      expect.objectContaining({
        userId: 'user-1', // derived from caller
        driverId: 'driver-1',
        organizationId: ORG_A,
      }),
    );
  });

  it('returns existing favorite id instead of creating duplicate', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // no mockGet needed (org is provided via args, not looked up)
    // query chain returns existing favorite from first()
    const ctx = makeCtx({ _id: 'fav-1' });
    const result = await driverRegistration.addFavoriteDriver.handler(ctx, {
      organizationId: ORG_A,
      driverId: 'driver-1' as any,
    });

    expect(result).toBe('fav-1');
    expect(mockInsert).not.toHaveBeenCalledWith('favoriteDrivers', expect.anything());
  });
});

describe('drivers.removeFavoriteDriver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      driverRegistration.removeFavoriteDriver.handler(makeCtx(null), {
        driverId: 'driver-1' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('removes favorite for caller', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // query chain returns existing favorite from first()
    const ctx = makeCtx({ _id: 'fav-1', userId: 'user-1', driverId: 'driver-1' });
    const result = await driverRegistration.removeFavoriteDriver.handler(ctx, {
      driverId: 'driver-1' as any,
    });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('fav-1');
  });
});
