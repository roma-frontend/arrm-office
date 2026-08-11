/**
 * Tests for convex/drivers/requests_queries.ts — every query handler: auth
 * gates, org scoping, enrichment, batch-loading maps, ETA math and stats.
 *
 * Pattern: convex-drivers-requests.test.ts — mock `_generated/server`,
 * lib/getAuthCaller, lib/auth, lib/userProfile and lib/limits; execute
 * withIndex/filter predicates; require inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  query: ({ handler, args }: any) => ({ handler, args }),
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

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
  SMALL_LIST_CAP: 10,
}));

jest.mock('../../convex/pagination', () => ({
  MAX_PAGE_SIZE: 50,
}));

jest.mock('convex/server', () => ({
  paginationOptsValidator: {},
}));

// ── Module under test ────────────────────────────────────────────────────────
let queries: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;

const ORG_A = 'org-1' as any;
const ORG_B = 'org-2' as any;
const USER_ID = 'user_emp';
const ADMIN_ID = 'user_admin';
const DRIVER_ID = 'driver_1';
const DRIVER_USER_ID = 'user_driver';
const REQ_ID = 'req_1';
const NOW = 1_700_000_000_000;

function makeCaller(role: string, org: string | undefined = ORG_A, id: string = USER_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function driverDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: DRIVER_ID,
    userId: DRIVER_USER_ID,
    organizationId: ORG_A,
    isAvailable: true,
    rating: 4.8,
    vehicleInfo: { make: 'Toyota', model: 'Camry' },
    ...overrides,
  };
}

function requestDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: REQ_ID,
    organizationId: ORG_A,
    requesterId: USER_ID,
    driverId: DRIVER_ID,
    startTime: NOW + 3_600_000,
    endTime: NOW + 7_200_000,
    tripInfo: { from: 'Office', to: 'Airport' },
    status: 'pending',
    ...overrides,
  };
}

function scheduleDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'sched_1',
    driverId: DRIVER_ID,
    userId: USER_ID,
    startTime: NOW + 3_600_000,
    status: 'scheduled',
    type: 'trip',
    ...overrides,
  };
}

function makeQueryBuilder() {
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  q.gte = jest.fn(() => q);
  q.lte = jest.fn(() => q);
  q.and = jest.fn(() => q);
  q.or = jest.fn(() => q);
  return q;
}

function makeChain() {
  const node: any = {};
  const q = makeQueryBuilder();
  node.take = jest.fn().mockResolvedValue([]);
  node.first = jest.fn().mockResolvedValue(null);
  node.unique = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: '' });
  return node;
}

type CtxHandle = ReturnType<typeof makeCtx>;

function makeCtx(opts: { docs?: Record<string, unknown> } = {}) {
  const { docs = {} } = opts;
  const get = jest.fn(async (id: string) => docs[id] ?? null);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return {
    ctx: { db },
    db,
    get,
    chain: (table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    queries = require('../../convex/drivers/requests_queries');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  mockGetProfile.mockResolvedValue(null);
  mockIsSuperadmin.mockReturnValue(false);
});

// ── getDriverRequests ────────────────────────────────────────────────────────
describe('getDriverRequests', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getDriverRequests.handler(h.ctx, { driverId: DRIVER_ID })).toEqual([]);
  });

  it('returns [] for a foreign caller who is not an admin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc({ userId: 'someone-else' }) } });
    expect(
      await queries.getDriverRequests.handler(h.ctx, { driverId: DRIVER_ID, status: 'pending' }),
    ).toEqual([]);
  });

  it('lets the driver read their own requests and enriches them', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, DRIVER_USER_ID));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc(),
        [USER_ID]: {
          _id: USER_ID,
          name: 'Requester',
          avatarUrl: 'a.png',
          position: 'Dev',
          phone: '555',
        },
      },
    });
    mockGetProfile.mockResolvedValue({ avatarUrl: 'p.png', position: 'PM', phone: '999' });
    h.chain('driverRequests').take.mockResolvedValue([requestDoc()]);

    const result = await queries.getDriverRequests.handler(h.ctx, {
      driverId: DRIVER_ID,
      status: 'pending',
    });

    expect(result[0]).toMatchObject({
      _id: REQ_ID,
      requesterName: 'Requester',
      requesterAvatar: 'p.png',
      requesterPosition: 'PM',
      requesterPhone: '999',
    });
    expect(h.chain('driverRequests').filter).toHaveBeenCalled();
  });

  it('lets an admin read requests without a status filter', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverRequests').take.mockResolvedValue([requestDoc()]);
    const result = await queries.getDriverRequests.handler(h.ctx, { driverId: DRIVER_ID });
    expect(result).toHaveLength(1);
    expect(h.chain('driverRequests').filter).not.toHaveBeenCalled();
  });

  it('proceeds when the driver record is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    h.chain('driverRequests').take.mockResolvedValue([]);
    expect(await queries.getDriverRequests.handler(h.ctx, { driverId: DRIVER_ID })).toEqual([]);
  });
});

// ── getMyRequests ────────────────────────────────────────────────────────────
describe('getMyRequests', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getMyRequests.handler(h.ctx, {})).toEqual([]);
  });

  it('enriches requests with driver, schedule and profile info', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc(),
        [DRIVER_USER_ID]: {
          _id: DRIVER_USER_ID,
          name: 'Driver Name',
          avatarUrl: 'd.png',
          phone: '777',
        },
      },
    });
    mockGetProfile.mockResolvedValue({ avatarUrl: 'prof.png', phone: '111' });
    h.chain('driverRequests').take.mockResolvedValue([requestDoc()]);
    h.chain('driverSchedules').first.mockResolvedValue(scheduleDoc({ status: 'completed' }));

    const result = await queries.getMyRequests.handler(h.ctx, {});

    expect(result[0]).toMatchObject({
      _id: REQ_ID,
      driverName: 'Driver Name',
      driverAvatar: 'prof.png',
      driverUserId: DRIVER_USER_ID,
      driverPhone: '111',
      driverVehicle: { make: 'Toyota', model: 'Camry' },
      scheduleStatus: 'completed',
      scheduleId: 'sched_1',
    });
  });

  it('handles requests whose driver record is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    h.chain('driverRequests').take.mockResolvedValue([requestDoc()]);
    const result = await queries.getMyRequests.handler(h.ctx, {});
    expect(result[0].driverName).toBeUndefined();
    expect(result[0].driverUserId).toBeUndefined();
  });
});

// ── listMyRequestsPaginated ──────────────────────────────────────────────────
describe('listMyRequestsPaginated', () => {
  const paginationOpts = { numItems: 10, cursor: null };

  it('returns an empty page when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.listMyRequestsPaginated.handler(h.ctx, { paginationOpts })).toEqual({
      page: [],
      continueCursor: '',
      isDone: true,
    });
  });

  it('paginates and enriches the page', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc(),
        [DRIVER_USER_ID]: { _id: DRIVER_USER_ID, name: 'Driver Name', avatarUrl: 'd.png' },
      },
    });
    h.chain('driverRequests').paginate.mockResolvedValue({
      page: [requestDoc()],
      isDone: true,
      continueCursor: 'cursor-1',
    });
    const result = await queries.listMyRequestsPaginated.handler(h.ctx, { paginationOpts });
    expect(result.page[0]).toMatchObject({
      _id: REQ_ID,
      driverName: 'Driver Name',
      driverVehicle: { make: 'Toyota', model: 'Camry' },
    });
  });
});

// ── getCompletedTrips ────────────────────────────────────────────────────────
describe('getCompletedTrips', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getCompletedTrips.handler(h.ctx, {})).toEqual([]);
  });

  it('returns completed trips with ratings for approved requests', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc(),
        [DRIVER_USER_ID]: { _id: DRIVER_USER_ID, name: 'Driver Name', avatarUrl: 'd.png' },
      },
    });
    mockGetProfile.mockResolvedValue({ avatarUrl: 'prof.png' });
    h.chain('driverRequests').take.mockResolvedValue([
      requestDoc({ status: 'approved' }),
      requestDoc({ _id: 'req_2', status: 'pending' }),
    ]);
    h.chain('driverSchedules').take.mockResolvedValue([
      scheduleDoc({ status: 'completed', updatedAt: 999, driverNotes: 'Nice', waitTimeMinutes: 5 }),
    ]);
    h.chain('passengerRatings').take.mockResolvedValue([{ scheduleId: 'sched_1', rating: 5 }]);

    const result = await queries.getCompletedTrips.handler(h.ctx, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: REQ_ID,
      scheduleId: 'sched_1',
      completedAt: 999,
      driverName: 'Driver Name',
      driverAvatar: 'prof.png',
      driverNotes: 'Nice',
      waitTimeMinutes: 5,
      hasRated: true,
      passengerRating: 5,
    });
  });

  it('honours the take limit and keeps the first completed trip', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverRequests').take.mockResolvedValue([
      requestDoc({ status: 'approved' }),
      requestDoc({ _id: 'req_2', status: 'approved', startTime: NOW + 9_000_000 }),
    ]);
    h.chain('driverSchedules').take.mockResolvedValue([
      scheduleDoc({ status: 'completed' }),
      scheduleDoc({ _id: 'sched_2', status: 'completed', startTime: NOW + 9_000_000 }),
    ]);
    h.chain('passengerRatings').take.mockResolvedValue([]);

    const result = await queries.getCompletedTrips.handler(h.ctx, { limit: 1 });
    expect(result).toHaveLength(1);
    // The earlier request is kept; the `take` break stops the later one.
    expect(result[0]._id).toBe(REQ_ID);
  });
});

// ── hasPassengerRated ────────────────────────────────────────────────────────
describe('hasPassengerRated', () => {
  it('returns false when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.hasPassengerRated.handler(h.ctx, { scheduleId: 'sched_1' })).toBe(false);
  });

  it('returns true when a rating exists', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    h.chain('passengerRatings').first.mockResolvedValue({ _id: 'r1' });
    expect(await queries.hasPassengerRated.handler(h.ctx, { scheduleId: 'sched_1' })).toBe(true);
  });

  it('returns false when no rating exists', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    expect(await queries.hasPassengerRated.handler(h.ctx, { scheduleId: 'sched_1' })).toBe(false);
  });
});

// ── getRecurringTrips ────────────────────────────────────────────────────────
describe('getRecurringTrips', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getRecurringTrips.handler(h.ctx, {})).toEqual([]);
  });

  it('filters to active trips when activeOnly and enriches with driver info', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc(),
        [DRIVER_USER_ID]: { _id: DRIVER_USER_ID, name: 'Driver Name', avatarUrl: 'd.png' },
      },
    });
    h.chain('recurringTrips').take.mockResolvedValue([
      { _id: 't1', driverId: DRIVER_ID, isActive: true },
      { _id: 't2', driverId: DRIVER_ID, isActive: false },
    ]);
    const result = await queries.getRecurringTrips.handler(h.ctx, { activeOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: 't1',
      driverName: 'Driver Name',
      driverVehicle: { make: 'Toyota', model: 'Camry' },
    });
  });
});

// ── getFavoriteDrivers ───────────────────────────────────────────────────────
describe('getFavoriteDrivers', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getFavoriteDrivers.handler(h.ctx, {})).toEqual([]);
  });

  it('returns [] when the caller has no organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', undefined));
    const h = makeCtx();
    expect(await queries.getFavoriteDrivers.handler(h.ctx, {})).toEqual([]);
  });

  it('returns [] for a cross-org request from a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    expect(await queries.getFavoriteDrivers.handler(h.ctx, { organizationId: ORG_B })).toEqual([]);
  });

  it('allows a superadmin to read another org', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, 'user_super'));
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      docs: { [DRIVER_ID]: driverDoc({ organizationId: ORG_B }) },
    });
    h.chain('favoriteDrivers').take.mockResolvedValue([
      { _id: 'f1', driverId: DRIVER_ID, createdAt: 123 },
    ]);
    const result = await queries.getFavoriteDrivers.handler(h.ctx, { organizationId: ORG_B });
    expect(result[0]).toMatchObject({
      _id: DRIVER_ID,
      userName: 'Unknown',
      favoritedAt: 123,
    });
  });

  it('drops drivers from a different organization and missing drivers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc({ organizationId: ORG_B }), // wrong org
      },
    });
    h.chain('favoriteDrivers').take.mockResolvedValue([
      { _id: 'f1', driverId: DRIVER_ID, createdAt: 1 },
      { _id: 'f2', driverId: 'driver_missing', createdAt: 2 },
    ]);
    const result = await queries.getFavoriteDrivers.handler(h.ctx, {});
    expect(result).toEqual([]);
  });

  it('enriches favorites with driver user info and profile', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({
      docs: {
        [DRIVER_ID]: driverDoc(),
        [DRIVER_USER_ID]: {
          _id: DRIVER_USER_ID,
          name: 'Driver Name',
          avatarUrl: 'd.png',
          position: 'Chauffeur',
          phone: '777',
        },
      },
    });
    mockGetProfile.mockResolvedValue({ avatarUrl: 'prof.png', position: 'Senior', phone: '111' });
    h.chain('favoriteDrivers').take.mockResolvedValue([
      { _id: 'f1', driverId: DRIVER_ID, createdAt: 55 },
    ]);
    const result = await queries.getFavoriteDrivers.handler(h.ctx, {});
    expect(result[0]).toMatchObject({
      userName: 'Driver Name',
      userAvatar: 'prof.png',
      userPosition: 'Senior',
      favoritedAt: 55,
    });
  });
});

// ── getScheduleETA ───────────────────────────────────────────────────────────
describe('getScheduleETA', () => {
  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getScheduleETA.handler(h.ctx, { scheduleId: 'sched_1' })).toBeNull();
  });

  it('returns null when the schedule is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    expect(await queries.getScheduleETA.handler(h.ctx, { scheduleId: 'sched_1' })).toBeNull();
  });

  it('computes a positive ETA for a future schedule', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { sched_1: scheduleDoc({ startTime: Date.now() + 120_000 }) } });
    const result = await queries.getScheduleETA.handler(h.ctx, { scheduleId: 'sched_1' });
    expect(result.etaMinutes).toBe(2);
    // Handler captures `now` at call time; allow a small clock skew.
    const approxArrival = result.etaMinutes * 60000 + Date.now();
    expect(Math.abs(result.estimatedArrival - approxArrival)).toBeLessThan(2_000);
  });

  it('clamps a past schedule to 0 minutes', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { sched_1: scheduleDoc({ startTime: Date.now() - 10_000_000 }) } });
    const result = await queries.getScheduleETA.handler(h.ctx, { scheduleId: 'sched_1' });
    expect(result.etaMinutes).toBe(0);
  });
});

// ── getDriverStats ───────────────────────────────────────────────────────────
describe('getDriverStats', () => {
  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getDriverStats.handler(h.ctx, { driverId: DRIVER_ID })).toBeNull();
  });

  it('returns null when the driver record is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const h = makeCtx();
    expect(await queries.getDriverStats.handler(h.ctx, { driverId: DRIVER_ID })).toBeNull();
  });

  it('returns null for a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_B));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    expect(await queries.getDriverStats.handler(h.ctx, { driverId: DRIVER_ID })).toBeNull();
  });

  it('computes stats across the week period', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const now = Date.now();
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverSchedules').take.mockResolvedValue([
      { status: 'completed', startTime: now - 3_600_000, endTime: now }, // 60 min
      { status: 'cancelled', startTime: now - 7_200_000, endTime: now },
      { status: 'completed', startTime: now - 1_800_000, endTime: now - 600_000 }, // 20 min
    ]);
    const result = await queries.getDriverStats.handler(h.ctx, {
      driverId: DRIVER_ID,
      period: 'week',
    });
    expect(result).toEqual({
      totalTrips: 2,
      totalWorkedHours: 1.3,
      rating: 4.8,
      isAvailable: true,
    });
  });

  it('supports month and year periods and defaults the rating', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    for (const period of ['month', 'year'] as const) {
      const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc({ rating: undefined }) } });
      h.chain('driverSchedules').take.mockResolvedValue([]);
      const result = await queries.getDriverStats.handler(h.ctx, { driverId: DRIVER_ID, period });
      expect(result).toMatchObject({ totalTrips: 0, totalWorkedHours: 0, rating: 5.0 });
    }
  });

  it('defaults to all time when no period is given', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverSchedules').take.mockResolvedValue([
      { status: 'completed', startTime: 1, endTime: 3_600_001 },
    ]);
    const result = await queries.getDriverStats.handler(h.ctx, { driverId: DRIVER_ID });
    expect(result.totalTrips).toBe(1);
  });
});

// ── getCurrentShift ──────────────────────────────────────────────────────────
describe('getCurrentShift', () => {
  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getCurrentShift.handler(h.ctx, { driverId: DRIVER_ID })).toBeNull();
  });

  it('returns null when the driver is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    expect(await queries.getCurrentShift.handler(h.ctx, { driverId: DRIVER_ID })).toBeNull();
  });

  it('returns null for a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_B));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    expect(await queries.getCurrentShift.handler(h.ctx, { driverId: DRIVER_ID })).toBeNull();
  });

  it('returns the active shift', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverShifts').first.mockResolvedValue({ _id: 'shift_1', status: 'active' });
    expect(await queries.getCurrentShift.handler(h.ctx, { driverId: DRIVER_ID })).toEqual({
      _id: 'shift_1',
      status: 'active',
    });
  });
});

// ── getShiftHistory ──────────────────────────────────────────────────────────
describe('getShiftHistory', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getShiftHistory.handler(h.ctx, { driverId: DRIVER_ID })).toEqual([]);
  });

  it('returns [] when the driver is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx();
    expect(await queries.getShiftHistory.handler(h.ctx, { driverId: DRIVER_ID })).toEqual([]);
  });

  it('returns [] for a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_B));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    expect(await queries.getShiftHistory.handler(h.ctx, { driverId: DRIVER_ID })).toEqual([]);
  });

  it('returns shifts with a default limit of 20', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverShifts').take.mockResolvedValue([{ _id: 's1' }]);
    const result = await queries.getShiftHistory.handler(h.ctx, { driverId: DRIVER_ID });
    expect(result).toEqual([{ _id: 's1' }]);
    expect(h.chain('driverShifts').take).toHaveBeenCalledWith(20);
  });

  it('honours an explicit limit', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const h = makeCtx({ docs: { [DRIVER_ID]: driverDoc() } });
    h.chain('driverShifts').take.mockResolvedValue([]);
    await queries.getShiftHistory.handler(h.ctx, { driverId: DRIVER_ID, limit: 5 });
    expect(h.chain('driverShifts').take).toHaveBeenCalledWith(5);
  });
});

// ── getShiftStatistics ───────────────────────────────────────────────────────
describe('getShiftStatistics', () => {
  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getShiftStatistics.handler(h.ctx, { organizationId: ORG_A })).toBeNull();
  });

  it('returns null for a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_B));
    const h = makeCtx();
    expect(await queries.getShiftStatistics.handler(h.ctx, { organizationId: ORG_A })).toBeNull();
  });

  it('computes week statistics', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const h = makeCtx();
    h.chain('driverShifts').take.mockResolvedValue([
      { status: 'completed', tripsCompleted: 4 },
      { status: 'active', tripsCompleted: 2 },
    ]);
    const result = await queries.getShiftStatistics.handler(h.ctx, {
      organizationId: ORG_A,
      period: 'week',
    });
    expect(result).toEqual({
      totalShifts: 2,
      completedShifts: 1,
      totalTrips: 6,
      averageTripsPerShift: 3,
    });
  });

  it('defaults to the month period and returns zero averages on empty data', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const h = makeCtx();
    h.chain('driverShifts').take.mockResolvedValue([]);
    const result = await queries.getShiftStatistics.handler(h.ctx, { organizationId: ORG_A });
    expect(result).toEqual({
      totalShifts: 0,
      completedShifts: 0,
      totalTrips: 0,
      averageTripsPerShift: 0,
    });
  });
});
