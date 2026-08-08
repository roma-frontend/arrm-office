/**
 * Tests for convex/drivers/requests_mutations.ts — the driver trip-request
 * lifecycle: requestDriver (full coverage), plus the branches the auth suite
 * leaves open: totalTrips bookkeeping, schedule cleanup on approved-request
 * edits/deletes, and the notify paths.
 *
 * Pattern: convex-signatures.test.ts — mock `_generated/server`,
 * lib/getAuthCaller, lib/auth and lib/notify; execute withIndex/filter
 * predicates so their bodies count as covered; require inside
 * jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockNotify.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/drivers/requests_mutations');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const USER_ID = 'user_emp';
const ADMIN_ID = 'user_admin';
const DRIVER_ID = 'driver_1';
const REQ_ID = 'req_1';

function makeCaller(role: string, org: string | undefined = ORG_A, id: string = USER_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

const NOW = 1_700_000_000_000;

function driverDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: DRIVER_ID,
    userId: 'user_driver',
    organizationId: ORG_A,
    isAvailable: true,
    totalTrips: 3,
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
    tripInfo: { from: 'Office', to: 'Airport', purpose: 'Client meeting', passengerCount: 2 },
    status: 'pending',
    ...overrides,
  };
}

function requestArgs(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_A,
    driverId: DRIVER_ID,
    startTime: NOW + 3_600_000,
    endTime: NOW + 7_200_000,
    tripInfo: {
      from: 'Office',
      to: 'Airport',
      purpose: 'Client meeting',
      passengerCount: 2,
      notes: 'Bring water',
    },
    ...overrides,
  };
}

// Query builder fake that executes withIndex/filter predicates.
function makeQueryBuilder() {
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  q.lte = jest.fn(() => q);
  q.gte = jest.fn(() => q);
  q.and = jest.fn(() => q);
  q.or = jest.fn(() => q);
  return q;
}

function makeChain() {
  const node: any = {};
  const q = makeQueryBuilder();
  node.take = jest.fn().mockResolvedValue([]);
  node.first = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  return node;
}

function makeCtx() {
  const get = jest.fn().mockResolvedValue(null);
  const insert = jest.fn().mockResolvedValue(REQ_ID);
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return { ctx: { db }, get, insert, patch, remove, chains, db };
}

/** Eagerly create (or return) the chain mock for a table. */
function chain(chains: Map<string, ReturnType<typeof makeChain>>, table: string) {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

// ── requestDriver ────────────────────────────────────────────────────────────
describe('requestDriver', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.requestDriver(ctx, requestArgs())).rejects.toThrow('Not authenticated');
  });

  it('throws when startTime is not before endTime', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(
      handlers.requestDriver(
        ctx,
        requestArgs({ startTime: NOW + 7_200_000, endTime: NOW + 3_600_000 }),
      ),
    ).rejects.toThrow('Start time must be before end time');
  });

  it('throws for NaN timestamps', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(
      handlers.requestDriver(ctx, requestArgs({ startTime: Number.NaN })),
    ).rejects.toThrow('Invalid startTime or endTime');
    // The other side of the `||` guard
    await expect(handlers.requestDriver(ctx, requestArgs({ endTime: Number.NaN }))).rejects.toThrow(
      'Invalid startTime or endTime',
    );
  });

  it('returns a DRIVER_ON_LEAVE error instead of throwing when the driver is on leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(driverDoc());
    const leaveCh = chain(chains, 'leaveRequests');
    leaveCh.take.mockResolvedValue([
      {
        type: 'paid',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
      },
    ]);
    // availability query comes back empty
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce(null);

    const res = (await handlers.requestDriver(ctx, requestArgs())) as any;

    expect(res.requestId).toBeNull();
    expect(res.error).toMatchObject({
      code: 'DRIVER_ON_LEAVE',
      leaveType: 'paid',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    });
    expect(res.error.message).toContain('с 2026-01-01 по 2026-01-10');
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('skips the leave check when the driver record is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(null); // no driver record
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce(null);

    const res = (await handlers.requestDriver(ctx, requestArgs())) as any;

    expect(res.requestId).toBe(REQ_ID);
    expect(ctx.db.query).not.toHaveBeenCalledWith('leaveRequests');
  });

  it('throws when the driver has an overlapping scheduled trip', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(driverDoc());
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce({ _id: 'sched_1' });

    await expect(handlers.requestDriver(ctx, requestArgs())).rejects.toThrow(
      'Driver is not available at this time',
    );
  });

  it('creates the request and notifies the driver with defaults for priority/category', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, insert, chains } = makeCtx();
    get
      .mockResolvedValueOnce(driverDoc()) // leave check
      .mockResolvedValueOnce(driverDoc()); // notification lookup
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce(null);

    const res = (await handlers.requestDriver(ctx, requestArgs())) as any;

    expect(res).toEqual({ requestId: REQ_ID, leaveWarning: null, error: null });
    expect(insert).toHaveBeenCalledWith(
      'driverRequests',
      expect.objectContaining({
        organizationId: ORG_A,
        requesterId: USER_ID,
        driverId: DRIVER_ID,
        status: 'pending',
        priority: 'P2',
        tripCategory: 'office_transfer',
        businessJustification: 'Client meeting',
        requiresApproval: false,
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'user_driver',
        type: 'driver_request',
        titleKey: 'notifications.titles.tripRequestNew',
        relatedId: `driver_request:${REQ_ID}`,
        route: '/drivers',
      }),
    );
  });

  it('passes through priority/tripCategory/costCenter and skips the driver notification when the driver is gone', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(null); // leave check — driver missing
    get.mockResolvedValueOnce(null); // notification lookup — driver gone
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce(null);

    await handlers.requestDriver(
      ctx,
      requestArgs({
        priority: 'P0',
        tripCategory: 'airport',
        costCenter: 'CC-12',
        requiresApproval: false,
      }),
    );

    expect(insert).toHaveBeenCalledWith(
      'driverRequests',
      expect.objectContaining({
        priority: 'P0',
        tripCategory: 'airport',
        costCenter: 'CC-12',
        businessJustification: 'Client meeting',
      }),
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('notifies the org admins when approval is required', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(driverDoc()).mockResolvedValueOnce(driverDoc());
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce(null);
    const usersCh = chain(chains, 'users');
    usersCh.take.mockResolvedValue([
      { _id: ADMIN_ID, email: 'a@a.com' },
      { _id: 'admin_2', email: 'b@b.com' },
    ]);

    const res = (await handlers.requestDriver(
      ctx,
      requestArgs({ requiresApproval: true, businessJustification: 'Overseas client' }),
    )) as any;

    expect(res.requestId).toBe(REQ_ID);
    expect(insert).toHaveBeenCalledWith(
      'driverRequests',
      expect.objectContaining({ requiresApproval: true }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(3); // driver + 2 admins
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: ADMIN_ID,
        type: 'system',
        titleKey: 'notifications.titles.tripNeedsApproval',
        params: { priority: 'P2', justification: 'Overseas client' },
      }),
    );
    expect(usersCh.withIndex).toHaveBeenCalledWith('by_org_role', expect.any(Function));
  });
});

// ── respondToDriverRequest ───────────────────────────────────────────────────
describe('respondToDriverRequest', () => {
  it('throws for a missing request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.respondToDriverRequest(ctx, {
        requestId: REQ_ID,
        driverId: DRIVER_ID,
        approved: true,
      }),
    ).rejects.toThrow('Request not found');
  });

  it('throws when the driver record is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(null); // no driver record

    await expect(
      handlers.respondToDriverRequest(ctx, {
        requestId: REQ_ID,
        driverId: DRIVER_ID,
        approved: true,
      }),
    ).rejects.toThrow('Only the assigned driver can respond to this request');
  });

  it('increments totalTrips when approving and the driver record exists', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc()) // request
      .mockResolvedValueOnce(driverDoc({ userId: 'user_driver' })) // driverRecord check
      .mockResolvedValueOnce(driverDoc({ totalTrips: 3 })); // totalTrips increment

    const res = (await handlers.respondToDriverRequest(ctx, {
      requestId: REQ_ID,
      driverId: DRIVER_ID,
      approved: true,
    })) as any;

    expect(res.success).toBe(true);
    expect(patch).toHaveBeenCalledWith(
      DRIVER_ID,
      expect.objectContaining({ totalTrips: 4, updatedAt: expect.any(Number) }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        type: 'driver_request_approved',
        params: { to: 'Airport' },
      }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'driverSchedules',
      expect.objectContaining({ type: 'trip', status: 'scheduled' }),
    );
  });

  it('uses the default decline reason when none is provided', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, get, insert } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc())
      .mockResolvedValueOnce(driverDoc({ userId: 'user_driver' }));

    const res = (await handlers.respondToDriverRequest(ctx, {
      requestId: REQ_ID,
      driverId: DRIVER_ID,
      approved: false,
    })) as any;

    expect(res.success).toBe(true);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        type: 'driver_request_rejected',
        params: { reason: 'Not specified' },
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'driver_request_declined', target: REQ_ID }),
    );
  });
});

// ── updateDriverRequest ──────────────────────────────────────────────────────
describe('updateDriverRequest', () => {
  it('removes the schedule and decrements totalTrips when editing an approved request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, patch, remove, chains } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc({ status: 'approved' }))
      .mockResolvedValueOnce(driverDoc({ totalTrips: 3 })) // decrement lookup
      .mockResolvedValueOnce(driverDoc()); // driver notification lookup
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce({ _id: 'sched_1' });

    const res = (await handlers.updateDriverRequest(ctx, {
      requestId: REQ_ID,
      endTime: NOW + 9_000_000,
    })) as any;

    expect(res.success).toBe(true);
    expect(remove).toHaveBeenCalledWith('sched_1');
    expect(patch).toHaveBeenCalledWith(DRIVER_ID, expect.objectContaining({ totalTrips: 2 }));
    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({
        status: 'pending',
        reviewedAt: undefined,
        declineReason: undefined,
      }),
    );
    // re-approval notification wording
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'user_driver',
        titleKey: 'notifications.titles.driverRequestUpdatedReapproval',
      }),
    );
  });

  it('skips schedule cleanup when an approved request has no matching schedule', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, patch, remove } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc({ status: 'approved' }))
      .mockResolvedValueOnce(driverDoc({ totalTrips: 0 })) // zero trips → no decrement
      .mockResolvedValueOnce(driverDoc());

    const res = (await handlers.updateDriverRequest(ctx, {
      requestId: REQ_ID,
      driverId: DRIVER_ID,
    })) as any;

    expect(res.success).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalledWith(DRIVER_ID, expect.objectContaining({ totalTrips: -1 }));
  });

  it('includes startTime and endTime in the patch when provided', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ status: 'pending' })).mockResolvedValueOnce(driverDoc()); // driver notification lookup

    await handlers.updateDriverRequest(ctx, {
      requestId: REQ_ID,
      startTime: NOW + 5_000_000,
      endTime: NOW + 6_000_000,
    });

    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({ startTime: NOW + 5_000_000, endTime: NOW + 6_000_000 }),
    );
  });

  it('throws for a missing request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.updateDriverRequest(ctx, { requestId: REQ_ID })).rejects.toThrow(
      'Request not found',
    );
  });

  it('does not notify when the driver record is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ requesterId: 'someone_else' }));
    get.mockResolvedValueOnce(null); // driver lookup

    await handlers.updateDriverRequest(ctx, { requestId: REQ_ID });

    expect(mockNotify).not.toHaveBeenCalled();
  });
});

// ── deleteDriverRequest ──────────────────────────────────────────────────────
describe('deleteDriverRequest', () => {
  it('removes the schedule entry for an approved request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, remove, patch, chains } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ status: 'approved' }));
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce({ _id: 'sched_1' });

    const res = (await handlers.deleteDriverRequest(ctx, { requestId: REQ_ID })) as any;

    expect(res.success).toBe(true);
    expect(remove).toHaveBeenCalledWith('sched_1');
    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({
        status: 'cancelled',
        cancelledAt: expect.any(Number),
        cancelledBy: USER_ID,
        cancellationReason: 'Cancelled by requester',
      }),
    );
  });

  it('lets an admin delete a foreign approved request without a schedule', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, remove, patch } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ requesterId: 'someone_else', status: 'approved' }));
    // no schedule entry

    const res = (await handlers.deleteDriverRequest(ctx, { requestId: REQ_ID })) as any;

    expect(res.success).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith(REQ_ID, expect.objectContaining({ status: 'cancelled' }));
  });
});

// ── reassignDriverRequest ────────────────────────────────────────────────────
describe('reassignDriverRequest', () => {
  it('notifies the new driver when their record exists', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc({ status: 'declined' })) // request
      .mockResolvedValueOnce(driverDoc({ _id: 'driver_2' })); // new driver record
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce(null); // no overlap

    const res = (await handlers.reassignDriverRequest(ctx, {
      requestId: REQ_ID,
      newDriverId: 'driver_2',
    })) as any;

    expect(res.success).toBe(true);
    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({
        driverId: 'driver_2',
        status: 'pending',
        declineReason: undefined,
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'driver_request_reassigned',
        details: expect.stringContaining('driver_2'),
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'user_driver',
        type: 'driver_request',
        titleKey: 'notifications.titles.driverRequestReassigned',
      }),
    );
  });

  it('rejects reassignment when the new driver overlaps', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ status: 'declined' }));
    const schedCh = chain(chains, 'driverSchedules');
    schedCh.first.mockResolvedValueOnce({ _id: 'sched_x' });

    await expect(
      handlers.reassignDriverRequest(ctx, { requestId: REQ_ID, newDriverId: 'driver_2' }),
    ).rejects.toThrow('New driver is not available at this time');
  });
});
