/**
 * Tests for the leaves read-path RBAC in convex/leaves/queries.ts.
 *
 * Model: employees/drivers only ever see their own leave requests
 * (listLeavesPaginated scoped by_user; getLeaveById owner-only); same-org
 * admins/supervisors see the org queue; superadmins see everything.
 *
 * Pattern: supervisorRatings-rbac.test.ts — mock `_generated/server`,
 * getAuthCaller, lib/auth and lib/userProfile, require the module inside
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

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../convex/leaves/helpers', () => ({
  enrichLeavesWithUserData: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockEnrich: jest.Mock;
let listLeavesPaginatedHandler: (ctx: any, args: any) => Promise<unknown>;
let getAllLeavesHandler: (ctx: any, args: any) => Promise<unknown>;
let getLeavesForOrganizationHandler: (ctx: any, args: any) => Promise<unknown>;
let getLeaveByIdHandler: (ctx: any, args: any) => Promise<unknown>;
let getUnreadCountHandler: (ctx: any, args: any) => Promise<unknown>;
let getLeaveStatsHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockEnrich = jest.requireMock('../../convex/leaves/helpers').enrichLeavesWithUserData;
  // clearAllMocks keeps implementations, so reset the shared mocks explicitly.
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  mockEnrich.mockReset();
  // Focus the tests on scoping, not enrichment.
  mockEnrich.mockImplementation((_ctx: any, leaves: any) => leaves);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const queries = require('../../convex/leaves/queries');
    listLeavesPaginatedHandler = queries.listLeavesPaginated.handler;
    getAllLeavesHandler = queries.getAllLeaves.handler;
    getLeavesForOrganizationHandler = queries.getLeavesForOrganization.handler;
    getLeaveByIdHandler = queries.getLeaveById.handler;
    getUnreadCountHandler = queries.getUnreadCount.handler;
    getLeaveStatsHandler = queries.getLeaveStats.handler;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const EMPLOYEE_ID = 'user_emp';
const ADMIN_ID = 'user_admin';
const LEAVE_ID = 'leave_1';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = EMPLOYEE_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

const paginationOpts = { numItems: 30, cursor: null };

/** ctx.db mock for paginated queries — query() returns a chain with both
 *  .withIndex() and .order() so indexed and plain paths both work. */
function makePaginatedCtx() {
  const paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: '' });
  const order = jest.fn().mockReturnValue({ paginate });
  const withIndex = jest.fn().mockReturnValue({ order });
  const db = {
    get: jest.fn(),
    query: jest.fn().mockReturnValue({ withIndex, order }),
  };
  return { ctx: { db }, paginate, order, withIndex };
}

function makeDetailCtx() {
  return { ctx: { db: { get: jest.fn() } } };
}

/** ctx.db mock for take()-based queries (getAllLeaves / getLeavesForOrganization). */
function makeTakeCtx() {
  const take = jest.fn().mockResolvedValue([]);
  const order = jest.fn().mockReturnValue({ take });
  const withIndex = jest.fn().mockReturnValue({ order, take });
  const db = {
    get: jest.fn(),
    query: jest.fn().mockReturnValue({ withIndex, order, take }),
  };
  return { ctx: { db }, take, order, withIndex };
}

/** Returns an ISO date `days` from today, so leave fixtures never fall on
 * the current day (keeps getLeaveStats' onLeaveToday counting stable). */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0] || '';
}

function leaveDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEAVE_ID,
    userId: EMPLOYEE_ID,
    organizationId: ORG_A,
    status: 'pending',
    type: 'paid',
    startDate: futureDate(30),
    endDate: futureDate(32),
    days: 3,
    reason: 'Family event',
    ...overrides,
  };
}

// ── listLeavesPaginated ──────────────────────────────────────────────────────
describe('listLeavesPaginated RBAC', () => {
  it('scopes an employee to their own leaves via by_user', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, withIndex, paginate } = makePaginatedCtx();

    const result = await listLeavesPaginatedHandler(ctx, {
      organizationId: ORG_A,
      paginationOpts,
    });

    expect(result).toEqual({ page: [], isDone: true, continueCursor: '' });
    expect(ctx.db.query).toHaveBeenCalledWith('leaveRequests');
    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('userId', EMPLOYEE_ID);
    expect(paginate).toHaveBeenCalledWith(paginationOpts);
  });

  it('ignores a client-supplied organizationId for employees (no org widening)', async () => {
    // The /leaves page passes a selected org id — an employee must still be
    // scoped to their own requests, not the whole org queue.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, withIndex } = makePaginatedCtx();

    await listLeavesPaginatedHandler(ctx, { organizationId: ORG_B, paginationOpts });

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('userId', EMPLOYEE_ID);
  });

  it('scopes a driver to their own leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, withIndex } = makePaginatedCtx();

    await listLeavesPaginatedHandler(ctx, { paginationOpts });

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });

  it('scopes an admin to the passed organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makePaginatedCtx();

    await listLeavesPaginatedHandler(ctx, { organizationId: ORG_B, paginationOpts });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('organizationId', ORG_B);
  });

  it('scopes a supervisor to their own org when no org is passed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makePaginatedCtx();

    await listLeavesPaginatedHandler(ctx, { paginationOpts });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('organizationId', ORG_A);
  });

  it('lets a superadmin see all leaves without an index', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex, order } = makePaginatedCtx();

    await listLeavesPaginatedHandler(ctx, { paginationOpts });

    expect(withIndex).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('lets a superadmin scope to a chosen organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex } = makePaginatedCtx();

    await listLeavesPaginatedHandler(ctx, { organizationId: ORG_B, paginationOpts });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('returns an empty page for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, withIndex } = makePaginatedCtx();

    const result = await listLeavesPaginatedHandler(ctx, { paginationOpts });

    expect(result).toEqual({ page: [], isDone: true, continueCursor: '' });
    expect(withIndex).not.toHaveBeenCalled();
  });
});

// ── getAllLeaves ─────────────────────────────────────────────────────────────
describe('getAllLeaves RBAC', () => {
  it('scopes an employee to their own leaves via by_user', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, withIndex } = makeTakeCtx();

    const result = await getAllLeavesHandler(ctx, {});

    expect(result).toEqual([]);
    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('userId', EMPLOYEE_ID);
  });

  it('scopes a driver to their own leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, withIndex } = makeTakeCtx();

    await getAllLeavesHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });

  it('scopes an admin to the org queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getAllLeavesHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('organizationId', ORG_A);
  });

  it('scopes a supervisor to the org queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getAllLeavesHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets a superadmin see all leaves without an index', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex, order } = makeTakeCtx();

    await getAllLeavesHandler(ctx, {});

    expect(withIndex).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('keeps the unauthenticated + organizationId server path', async () => {
    // Used by server-side callers (e.g. chat routes) that pass an org directly.
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, withIndex } = makeTakeCtx();

    await getAllLeavesHandler(ctx, { organizationId: ORG_B });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('organizationId', ORG_B);
  });

  it('returns an empty array for unauthenticated callers without an org', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, withIndex } = makeTakeCtx();

    const result = await getAllLeavesHandler(ctx, {});

    expect(result).toEqual([]);
    expect(withIndex).not.toHaveBeenCalled();
  });
});

// ── getLeavesForOrganization ──────────────────────────────────────────────────
describe('getLeavesForOrganization RBAC', () => {
  it('lets a superadmin read any organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex } = makeTakeCtx();

    await getLeavesForOrganizationHandler(ctx, { organizationId: ORG_B });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets a same-org admin read the organization queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeavesForOrganizationHandler(ctx, { organizationId: ORG_A });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets a same-org supervisor read the organization queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeavesForOrganizationHandler(ctx, { organizationId: ORG_A });

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('returns an empty list for a staff member querying a foreign organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    const result = await getLeavesForOrganizationHandler(ctx, { organizationId: ORG_B });

    expect(result).toEqual([]);
    expect(withIndex).not.toHaveBeenCalled();
  });

  it('scopes an employee to their own leaves (no org queue on the calendar)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeavesForOrganizationHandler(ctx, { organizationId: ORG_A });

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('userId', EMPLOYEE_ID);
  });

  it('returns an empty array for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, withIndex } = makeTakeCtx();

    const result = await getLeavesForOrganizationHandler(ctx, { organizationId: ORG_A });

    expect(result).toEqual([]);
    expect(withIndex).not.toHaveBeenCalled();
  });
});

// ── getUnreadCount ───────────────────────────────────────────────────────────
describe('getUnreadCount RBAC', () => {
  it('returns 0 for an employee without touching the database', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx } = makeTakeCtx();

    const result = await getUnreadCountHandler(ctx, {});

    expect(result).toBe(0);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it('returns 0 for a driver without touching the database', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx } = makeTakeCtx();

    const result = await getUnreadCountHandler(ctx, {});

    expect(result).toBe(0);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it('counts only unread pending requests for an admin (org queue)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex, take } = makeTakeCtx();
    take.mockResolvedValueOnce([
      leaveDoc({ status: 'pending', isRead: false }),
      leaveDoc({ status: 'pending', isRead: true }),
      leaveDoc({ status: 'pending' }), // missing isRead counts as unread
      leaveDoc({ status: 'approved', isRead: false }), // not pending
    ]);

    const result = await getUnreadCountHandler(ctx, {});

    expect(result).toBe(2);
    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('counts unread pending for a supervisor (org queue)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getUnreadCountHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets a superadmin count unread across all organizations', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex, order } = makeTakeCtx();

    await getUnreadCountHandler(ctx, {});

    expect(withIndex).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('treats a bootstrap-email admin (role admin + isSuperadmin) as superadmin', async () => {
    // The isSuperadmin fallback must be evaluated before the role check, or
    // this admin would be short-circuited into the org-only branch.
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex, order } = makeTakeCtx();

    await getUnreadCountHandler(ctx, {});

    expect(withIndex).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('returns 0 for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeTakeCtx();

    const result = await getUnreadCountHandler(ctx, {});

    expect(result).toBe(0);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });
});

// ── getLeaveStats ────────────────────────────────────────────────────────────
describe('getLeaveStats RBAC', () => {
  it('scopes an employee to their own leaves via by_user', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeaveStatsHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('userId', EMPLOYEE_ID);
  });

  it('scopes a driver to their own leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeaveStatsHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });

  it('computes personal stats from own leaves only (no org leak)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, take } = makeTakeCtx();
    const today = new Date().toISOString().split('T')[0] || '';
    take.mockResolvedValueOnce([
      leaveDoc({ status: 'pending' }),
      leaveDoc({ status: 'approved' }),
      leaveDoc({ status: 'approved', startDate: today, endDate: today }),
      leaveDoc({ status: 'rejected' }),
      leaveDoc({ status: 'cancel_requested' }),
    ]);

    const result = (await getLeaveStatsHandler(ctx, {})) as any;

    expect(result).toEqual({
      total: 5,
      pending: 1,
      approved: 2,
      rejected: 1,
      pendingCancellations: 1,
      onLeaveToday: 1,
    });
  });

  it('scopes an admin to the org queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeaveStatsHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    const eqMock = jest.fn();
    withIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('organizationId', ORG_A);
  });

  it('scopes a supervisor to the org queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, withIndex } = makeTakeCtx();

    await getLeaveStatsHandler(ctx, {});

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets a superadmin aggregate across all organizations', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex, order } = makeTakeCtx();

    await getLeaveStatsHandler(ctx, {});

    expect(withIndex).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('treats a bootstrap-email admin (role admin + isSuperadmin) as superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, withIndex, order } = makeTakeCtx();

    await getLeaveStatsHandler(ctx, {});

    expect(withIndex).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith('desc');
  });

  it('returns an empty array for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, withIndex } = makeTakeCtx();

    const result = await getLeaveStatsHandler(ctx, {});

    expect(result).toEqual([]);
    expect(withIndex).not.toHaveBeenCalled();
  });
});

// ── getLeaveById ─────────────────────────────────────────────────────────────
describe('getLeaveById RBAC', () => {
  it('allows the owner to view their own leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce({
      _id: EMPLOYEE_ID,
      name: 'Emp Name',
    });
    mockGetProfile.mockResolvedValue({ department: 'Engineering' });

    const result = (await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID })) as any;

    expect(result).toEqual(
      expect.objectContaining({ userName: 'Emp Name', userDepartment: 'Engineering' }),
    );
  });

  it('returns null for a non-owner employee (no cross-user reads)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc({ userId: 'user_other' }));

    const result = await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID });

    expect(result).toBeNull();
    // No further reads (user/profile lookups must not run for rejected access).
    expect(ctx.db.get).toHaveBeenCalledTimes(1);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('allows a same-org admin to view any leave of the organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce({
      _id: EMPLOYEE_ID,
      name: 'Emp Name',
    });

    const result = await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID });

    expect(result).not.toBeNull();
  });

  it('allows a same-org supervisor to view any leave of the organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce({
      _id: EMPLOYEE_ID,
      name: 'Emp Name',
    });

    const result = await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID });

    expect(result).not.toBeNull();
  });

  it('returns null for a cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc()); // leave belongs to ORG_A

    const result = await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID });

    expect(result).toBeNull();
    expect(ctx.db.get).toHaveBeenCalledTimes(1);
  });

  it('allows a superadmin to view any leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce({
      _id: EMPLOYEE_ID,
      name: 'Emp Name',
    });

    const result = (await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID })) as any;

    expect(result?.userName).toBe('Emp Name');
  });

  it('returns null for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(leaveDoc());

    const result = await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID });

    expect(result).toBeNull();
    expect(ctx.db.get).toHaveBeenCalledTimes(1);
  });

  it('returns null when the leave does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeDetailCtx();
    ctx.db.get.mockResolvedValueOnce(null);

    const result = await getLeaveByIdHandler(ctx, { leaveId: LEAVE_ID });

    expect(result).toBeNull();
  });
});
